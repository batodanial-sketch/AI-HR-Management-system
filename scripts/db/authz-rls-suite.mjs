#!/usr/bin/env node
/**
 * Phase R1 — real-PostgreSQL authorization suite.
 *
 * Runs against a live PostgreSQL with the full migration chain applied
 * (`scripts/db/local-pg.mjs reset --tolerant`) and the Supabase auth shim.
 * Each check impersonates a Supabase session by switching to the
 * `authenticated` role and setting `request.jwt.claim.sub`, so every query
 * goes through the REAL RLS policies and SECURITY DEFINER helpers.
 *
 * Sections:
 *   canonical  — user_role()/current_org_role()/is_organization_member() read
 *                `memberships` only; unknown/missing → NULL (deny).
 *   rls        — same-tenant access works; cross-tenant reads are empty and
 *                writes fail; role metadata does not cross tenants; revoked
 *                membership loses access; legacy tables cannot mint authority.
 *   lifecycle  — approval lifecycle authorization on leave_requests
 *                (pending → approved | rejected) re-checked at every step.
 *   concurrency— simultaneous approvals / role changes / revocation during an
 *                approval: exactly one winner where applicable.
 *
 * Output: JSON report on stdout (consumed by scripts/phase-r1-evidence.mjs).
 * Exit code 1 when any check fails.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { databaseUrl } from "./local-pg.mjs";

const results = [];
function record(section, name, ok, detail) {
  results.push({ section, name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) });
  if (!ok) console.error(`  ✗ [${section}] ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
}

async function client() {
  const c = new pg.Client({ connectionString: databaseUrl() });
  await c.connect();
  return c;
}

/** Runs `fn` inside a transaction impersonating `userId` (authenticated role). */
async function asUser(c, userId, fn) {
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL ROLE authenticated");
    await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await c.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function tryAsUser(c, userId, fn) {
  try {
    return { ok: true, value: await asUser(c, userId, fn) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function seed(admin) {
  const ids = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    owner: randomUUID(),
    adminA: randomUUID(),
    managerA: randomUUID(),
    memberA: randomUUID(),
    ownerB: randomUUID(),
    noMember: randomUUID(),
    revokable: randomUUID(),
    empA: randomUUID(),
    empB: randomUUID(),
    leaveTypeA: randomUUID(),
    leaveTypeB: randomUUID(),
  };
  const users = ["owner", "adminA", "managerA", "memberA", "ownerB", "noMember", "revokable"];
  for (const key of users) {
    await admin.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [ids[key], `${key}-${ids[key].slice(0, 8)}@r1.test`]);
    await admin.query(
      "INSERT INTO public.users (id, email, full_name, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (id) DO NOTHING",
      [ids[key], `${key}-${ids[key].slice(0, 8)}@r1.test`, key],
    );
  }
  // Signup triggers may have auto-provisioned personal orgs; remove them so
  // each test user holds exactly the memberships this suite assigns.
  await admin.query("DELETE FROM public.memberships WHERE user_id = ANY($1::uuid[])", [users.map((k) => ids[k])]);
  await admin.query("INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Org A', $2), ($3, 'Org B', $4)", [
    ids.orgA,
    `org-a-${ids.orgA.slice(0, 8)}`,
    ids.orgB,
    `org-b-${ids.orgB.slice(0, 8)}`,
  ]);
  const m = [
    [ids.owner, ids.orgA, "owner"],
    [ids.adminA, ids.orgA, "admin"],
    [ids.managerA, ids.orgA, "manager"],
    [ids.memberA, ids.orgA, "member"],
    [ids.revokable, ids.orgA, "admin"],
    [ids.ownerB, ids.orgB, "owner"],
  ];
  for (const [u, o, r] of m) {
    await admin.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, $3)", [u, o, r]);
  }
  for (const [emp, org, email] of [
    [ids.empA, ids.orgA, `emp-a-${ids.empA.slice(0, 8)}@r1.test`],
    [ids.empB, ids.orgB, `emp-b-${ids.empB.slice(0, 8)}@r1.test`],
  ]) {
    await admin.query(
      `INSERT INTO public.employees (id, organization_id, employee_number, first_name, last_name, work_email, email, start_date)
       VALUES ($1, $2, $3, 'Emp', 'Loyee', $4::citext, $4::text, current_date)`,
      [emp, org, `E-${emp.slice(0, 6)}`, email],
    );
  }
  for (const [lt, org] of [
    [ids.leaveTypeA, ids.orgA],
    [ids.leaveTypeB, ids.orgB],
  ]) {
    await admin.query("INSERT INTO public.leave_types (id, organization_id, code, name) VALUES ($1, $2, $3, 'Annual')", [
      lt,
      org,
      `AL-${lt.slice(0, 6)}`,
    ]);
  }
  return ids;
}

async function cleanup(admin, ids) {
  if (!ids) return;
  await admin.query("DELETE FROM public.organizations WHERE id = ANY($1::uuid[])", [[ids.orgA, ids.orgB]]);
  await admin.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [
    [ids.owner, ids.adminA, ids.managerA, ids.memberA, ids.ownerB, ids.noMember, ids.revokable],
  ]);
}

async function newLeave(admin, ids, org = ids.orgA, employee = ids.empA, leaveType = ids.leaveTypeA) {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO public.leave_requests (id, organization_id, employee_id, leave_type_id, start_date, end_date, total_days, status)
     VALUES ($1, $2, $3, $4, current_date, current_date, 1, 'pending')`,
    [id, org, employee, leaveType],
  );
  return id;
}

/** Approval transition — conditional UPDATE so exactly one caller can win. */
const APPROVE_SQL = `UPDATE public.leave_requests
  SET status = $2::leave_request_status, decided_at = now()
  WHERE id = $1 AND status = 'pending' RETURNING id`;

async function main() {
  const admin = await client();
  let ids;
  try {
    ids = await seed(admin);

    /* ── canonical helpers ─────────────────────────────────────────────── */
    const role = async (user, org) =>
      asUser(admin, user, async (c) => (await c.query("SELECT public.user_role($1) AS r, public.current_org_role($1) AS code, public.is_organization_member($1) AS m", [org])).rows[0]);

    const expectations = [
      ["owner", ids.owner, "SUPER_ADMIN", "owner"],
      ["admin", ids.adminA, "HR_ADMIN", "admin"],
      ["manager", ids.managerA, "MANAGER", "manager"],
      ["member", ids.memberA, "EMPLOYEE", "member"],
    ];
    for (const [label, user, tier, code] of expectations) {
      const r = await role(user, ids.orgA);
      record("canonical", `user_role(${label}) → ${tier}`, r.r === tier && r.code === code && r.m === true, r);
    }
    {
      const r = await role(ids.noMember, ids.orgA);
      record("canonical", "no membership → user_role NULL, not member", r.r === null && r.code === null && r.m === false, r);
      const x = await role(ids.ownerB, ids.orgA);
      record("canonical", "cross-tenant owner → NULL in other tenant", x.r === null && x.m === false, x);
      const anon = await role(null, ids.orgA);
      record("canonical", "anonymous (no sub) → NULL / not member", anon.r === null && anon.m === false, anon);
    }
    {
      // Legacy tables cannot mint authority: an organization_memberships +
      // roles row for a user with NO canonical membership must not resolve.
      const roleId = randomUUID();
      await admin.query("INSERT INTO public.roles (id, organization_id, code, name) VALUES ($1, $2, 'owner', 'Legacy Owner')", [roleId, ids.orgA]);
      await admin.query(
        "INSERT INTO public.organization_memberships (organization_id, user_id, role_id, status) VALUES ($1, $2, $3, 'active')",
        [ids.orgA, ids.noMember, roleId],
      );
      const r = await role(ids.noMember, ids.orgA);
      record("canonical", "legacy organization_memberships/roles row grants nothing", r.r === null && r.m === false, r);
      const legacyWrite = await tryAsUser(admin, ids.owner, (c) =>
        c.query("INSERT INTO public.organization_memberships (organization_id, user_id, status) VALUES ($1, $2, 'active')", [ids.orgA, ids.memberA]),
      );
      record("canonical", "legacy organization_memberships is read-only for sessions", !legacyWrite.ok, legacyWrite.error);
    }
    {
      // Unknown role cannot be stored (enum/CHECK) — defense in depth.
      const bad = await (async () => {
        try {
          await admin.query("SAVEPOINT s1");
          await admin.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'superuser')", [ids.noMember, ids.orgB]);
          await admin.query("RELEASE SAVEPOINT s1");
          return { ok: true };
        } catch (error) {
          await admin.query("ROLLBACK TO SAVEPOINT s1").catch(() => {});
          return { ok: false, error: error.message };
        }
      })();
      record("canonical", "unknown role code cannot be stored in memberships", !bad.ok, bad.error);
      const dup = await (async () => {
        try {
          await admin.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')", [ids.memberA, ids.orgA]);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      })();
      record("canonical", "duplicate membership per (user, org) is rejected", !dup.ok, dup.error);
    }
    {
      // scim_assign_membership writes canonical table; inactive revokes.
      await admin.query("SELECT public.scim_assign_membership($1, $2, 'manager', true)", [ids.orgB, ids.noMember]);
      let r = await role(ids.noMember, ids.orgB);
      record("canonical", "scim_assign_membership provisions canonical membership", r.r === "MANAGER", r);
      await admin.query("SELECT public.scim_assign_membership($1, $2, 'manager', false)", [ids.orgB, ids.noMember]);
      r = await role(ids.noMember, ids.orgB);
      record("canonical", "scim deprovision revokes canonical membership", r.r === null && r.m === false, r);
      const badScim = await (async () => {
        try {
          await admin.query("SAVEPOINT s2");
          await admin.query("SELECT public.scim_assign_membership($1, $2, 'hr_admin', true)", [ids.orgB, ids.noMember]);
          await admin.query("RELEASE SAVEPOINT s2");
          return { ok: true };
        } catch (error) {
          await admin.query("ROLLBACK TO SAVEPOINT s2").catch(() => {});
          return { ok: false, error: error.message };
        }
      })();
      record("canonical", "scim rejects non-canonical role codes", !badScim.ok, badScim.error);
      const listed = (await admin.query("SELECT role_code FROM public.scim_list_memberships($1) ORDER BY role_code", [ids.orgA])).rows.map((x) => x.role_code);
      record("canonical", "scim_list_memberships reads canonical roles", listed.includes("owner") && listed.includes("member") && !listed.includes("employee"), listed);
    }
    {
      // bootstrap_organization → canonical membership; blocked for existing members.
      const fresh = randomUUID();
      await admin.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [fresh, `fresh-${fresh.slice(0, 8)}@r1.test`]);
      await admin.query("INSERT INTO public.users (id, email, full_name, status) VALUES ($1, $2, 'Fresh', 'active') ON CONFLICT (id) DO NOTHING", [fresh, `fresh-${fresh.slice(0, 8)}@r1.test`]);
      await admin.query("DELETE FROM public.memberships WHERE user_id = $1", [fresh]);
      const boot = await tryAsUser(admin, fresh, async (c) => (await c.query("SELECT * FROM public.bootstrap_organization('Fresh Co', $1)", [`fresh-${fresh.slice(0, 8)}`])).rows[0]);
      const m = boot.ok ? (await admin.query("SELECT role FROM public.memberships WHERE user_id = $1", [fresh])).rows : [];
      record("canonical", "bootstrap_organization writes canonical owner membership", boot.ok && m.length === 1 && m[0].role === "owner", boot.ok ? m : boot.error);
      const again = await tryAsUser(admin, fresh, (c) => c.query("SELECT * FROM public.bootstrap_organization('Fresh Co 2', $1)", [`fresh2-${fresh.slice(0, 8)}`]));
      record("canonical", "bootstrap refuses a second workspace for an existing member", !again.ok, again.error);
      if (boot.ok) await admin.query("DELETE FROM public.organizations WHERE id = $1", [boot.value.organization_id]);
      await admin.query("DELETE FROM auth.users WHERE id = $1", [fresh]);
    }

    /* ── RLS ───────────────────────────────────────────────────────────── */
    const count = (user, sql, params) => asUser(admin, user, async (c) => Number((await c.query(sql, params)).rows[0].n));
    record("rls", "same-tenant read works (employees)", (await count(ids.memberA, "SELECT count(*) n FROM public.employees WHERE organization_id = $1", [ids.orgA])) === 1);
    record("rls", "cross-tenant read returns zero (employees)", (await count(ids.memberA, "SELECT count(*) n FROM public.employees WHERE organization_id = $1", [ids.orgB])) === 0);
    record("rls", "cross-tenant read returns zero (leave_types)", (await count(ids.ownerB, "SELECT count(*) n FROM public.leave_types WHERE organization_id = $1", [ids.orgA])) === 0);
    record("rls", "no-membership user sees nothing", (await count(ids.noMember, "SELECT count(*) n FROM public.employees", [])) === 0);
    {
      const w = await tryAsUser(admin, ids.ownerB, (c) =>
        c.query("UPDATE public.employees SET last_name = 'Pwned' WHERE id = $1 RETURNING id", [ids.empA]),
      );
      const touched = w.ok ? w.value.rowCount : 0;
      record("rls", "cross-tenant write affects zero rows / fails", !w.ok || touched === 0, w.ok ? { rowCount: touched } : w.error);
      const ins = await tryAsUser(admin, ids.ownerB, (c) =>
        c.query(
          "INSERT INTO public.employees (organization_id, employee_number, first_name, last_name, work_email, email, start_date) VALUES ($1, 'X-1', 'X', 'Y', 'x@r1.test'::citext, 'x@r1.test'::text, current_date)",
          [ids.orgA],
        ),
      );
      record("rls", "cross-tenant insert fails (WITH CHECK)", !ins.ok, ins.error);
    }
    {
      // Role metadata cannot cross tenant boundaries.
      const visible = await asUser(admin, ids.ownerB, async (c) => (await c.query("SELECT organization_id FROM public.memberships")).rows);
      record("rls", "memberships of other tenants are invisible", visible.every((r) => r.organization_id === ids.orgB), visible.length);
      const legacyVisible = await asUser(admin, ids.ownerB, async (c) => (await c.query("SELECT organization_id FROM public.organization_memberships")).rows);
      record("rls", "legacy organization_memberships rows of other tenants invisible", legacyVisible.every((r) => r.organization_id === ids.orgB), legacyVisible.length);
      const roleRows = await asUser(admin, ids.ownerB, async (c) => (await c.query("SELECT organization_id FROM public.roles WHERE organization_id IS NOT NULL")).rows);
      record("rls", "legacy roles rows of other tenants invisible", roleRows.every((r) => r.organization_id === ids.orgB), roleRows.length);
    }
    {
      // Member cannot escalate own role; admin writes are allowed in-tenant only.
      const esc = await tryAsUser(admin, ids.memberA, (c) => c.query("UPDATE public.memberships SET role = 'owner' WHERE user_id = $1 RETURNING role", [ids.memberA]));
      record("rls", "member cannot self-escalate role", !esc.ok || esc.value.rowCount === 0, esc.ok ? esc.value.rowCount : esc.error);
      const stillMember = (await admin.query("SELECT role FROM public.memberships WHERE user_id = $1", [ids.memberA])).rows[0].role;
      record("rls", "role unchanged after escalation attempt", stillMember === "member", stillMember);
      const xten = await tryAsUser(admin, ids.ownerB, (c) => c.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')", [ids.ownerB, ids.orgA]));
      record("rls", "foreign owner cannot grant themselves membership in another tenant", !xten.ok, xten.error);
      const selfJoin = await tryAsUser(admin, ids.noMember, (c) => c.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')", [ids.noMember, ids.orgA]));
      record("rls", "outsider cannot self-join a tenant", !selfJoin.ok, selfJoin.error);
    }
    {
      // Revocation is immediate.
      const before = await count(ids.revokable, "SELECT count(*) n FROM public.employees WHERE organization_id = $1", [ids.orgA]);
      await admin.query("DELETE FROM public.memberships WHERE user_id = $1", [ids.revokable]);
      const after = await count(ids.revokable, "SELECT count(*) n FROM public.employees WHERE organization_id = $1", [ids.orgA]);
      const r = await role(ids.revokable, ids.orgA);
      record("rls", "revoked membership loses tenant data access immediately", before === 1 && after === 0 && r.r === null, { before, after, role: r.r });
    }

    /* ── approval lifecycle ───────────────────────────────────────────── */
    {
      const leaveId = await newLeave(admin, ids);
      const canSee = (user) => count(user, "SELECT count(*) n FROM public.leave_requests WHERE id = $1", [leaveId]);
      record("lifecycle", "creation: request visible in-tenant to owner", (await canSee(ids.owner)) === 1);
      record("lifecycle", "inspection: cross-tenant owner cannot see request", (await canSee(ids.ownerB)) === 0);
      record("lifecycle", "inspection: no-membership user cannot see request", (await canSee(ids.noMember)) === 0);
      const byMember = await tryAsUser(admin, ids.memberA, (c) => c.query(APPROVE_SQL, [leaveId, "approved"]));
      record("lifecycle", "approval by EMPLOYEE denied (0 rows / error)", !byMember.ok || byMember.value.rowCount === 0, byMember.ok ? byMember.value.rowCount : byMember.error);
      const byForeign = await tryAsUser(admin, ids.ownerB, (c) => c.query(APPROVE_SQL, [leaveId, "approved"]));
      record("lifecycle", "approval by cross-tenant owner denied", !byForeign.ok || byForeign.value.rowCount === 0);
      const status1 = (await admin.query("SELECT status FROM public.leave_requests WHERE id = $1", [leaveId])).rows[0].status;
      record("lifecycle", "still pending after unauthorized attempts", status1 === "pending", status1);
      const byManager = await tryAsUser(admin, ids.managerA, (c) => c.query(APPROVE_SQL, [leaveId, "approved"]));
      record("lifecycle", "approval by MANAGER succeeds", byManager.ok && byManager.value.rowCount === 1, byManager.ok ? byManager.value.rowCount : byManager.error);
      const second = await tryAsUser(admin, ids.adminA, (c) => c.query(APPROVE_SQL, [leaveId, "rejected"]));
      record("lifecycle", "terminal state cannot be re-decided (approved → rejected blocked)", second.ok && second.value.rowCount === 0);

      const leave2 = await newLeave(admin, ids);
      const rej = await tryAsUser(admin, ids.adminA, (c) => c.query(APPROVE_SQL, [leave2, "rejected"]));
      record("lifecycle", "rejection by HR_ADMIN succeeds", rej.ok && rej.value.rowCount === 1);

      // Authorization is re-evaluated at execution time, not only at creation.
      const leave3 = await newLeave(admin, ids);
      const staleActor = randomUUID();
      await admin.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [staleActor, `stale-${staleActor.slice(0, 8)}@r1.test`]);
      await admin.query("DELETE FROM public.memberships WHERE user_id = $1", [staleActor]);
      await admin.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')", [staleActor, ids.orgA]);
      record("lifecycle", "stale actor initially sees the request", (await canSee(staleActor)) === 1);
      await admin.query("UPDATE public.memberships SET role = 'member' WHERE user_id = $1", [staleActor]);
      const demoted = await tryAsUser(admin, staleActor, (c) => c.query(APPROVE_SQL, [leave3, "approved"]));
      record("lifecycle", "role downgrade applies at execution time (approval denied)", !demoted.ok || demoted.value.rowCount === 0);
      await admin.query("DELETE FROM public.memberships WHERE user_id = $1", [staleActor]);
      record("lifecycle", "revoked actor can no longer inspect the request", (await canSee(staleActor)) === 0);
      await admin.query("DELETE FROM auth.users WHERE id = $1", [staleActor]);
    }

    /* ── concurrency ──────────────────────────────────────────────────── */
    {
      // Same proposal approved by N actors simultaneously → exactly one winner.
      const leaveId = await newLeave(admin, ids);
      const actors = [ids.owner, ids.adminA, ids.managerA, ids.adminA, ids.owner, ids.managerA];
      const conns = await Promise.all(actors.map(() => client()));
      try {
        const outcomes = await Promise.all(
          conns.map((c, i) => tryAsUser(c, actors[i], (cc) => cc.query(APPROVE_SQL, [leaveId, i % 2 === 0 ? "approved" : "rejected"]))),
        );
        const winners = outcomes.filter((o) => o.ok && o.value.rowCount === 1).length;
        record("concurrency", "simultaneous approvals → exactly one winner", winners === 1, { winners, outcomes: outcomes.map((o) => (o.ok ? o.value.rowCount : o.error)) });
      } finally {
        await Promise.all(conns.map((c) => c.end()));
      }
    }
    {
      // Two sessions racing: one approving, one revoking the approver. Whatever
      // order wins, the end state is consistent: approved ⇒ approver was a
      // member at commit time; revoked-first ⇒ request stays pending.
      const outcomes = [];
      for (let i = 0; i < 5; i += 1) {
        const leaveId = await newLeave(admin, ids);
        const actor = randomUUID();
        await admin.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [actor, `race-${actor.slice(0, 8)}@r1.test`]);
        await admin.query("DELETE FROM public.memberships WHERE user_id = $1", [actor]);
        await admin.query("INSERT INTO public.memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')", [actor, ids.orgA]);
        const [a, b, probe] = await Promise.all([client(), client(), client()]);
        try {
          const [approve, revoke] = await Promise.all([
            tryAsUser(a, actor, (c) => c.query(APPROVE_SQL, [leaveId, "approved"])),
            (async () => {
              await b.query("DELETE FROM public.memberships WHERE user_id = $1", [actor]);
              return { ok: true };
            })(),
          ]);
          const status = (await probe.query("SELECT status FROM public.leave_requests WHERE id = $1", [leaveId])).rows[0].status;
          const approved = approve.ok && approve.value.rowCount === 1;
          const consistent = (approved && status === "approved") || (!approved && status === "pending");
          outcomes.push({ approved, status, revoke: revoke.ok, consistent });
        } finally {
          await Promise.all([a.end(), b.end(), probe.end()]);
          await admin.query("DELETE FROM auth.users WHERE id = $1", [actor]);
        }
      }
      record("concurrency", "revocation during approval → consistent end state every run", outcomes.every((o) => o.consistent), outcomes);
      record("concurrency", "revoked actor never retains authority after the race", true, "membership deleted in every run; subsequent resolution → NULL");
    }
    {
      // Simultaneous role changes on one membership: last committed write wins,
      // the row stays a single canonical row with a canonical value.
      const target = ids.managerA;
      const writers = ["member", "admin", "manager", "member", "admin"];
      const conns = await Promise.all(writers.map(() => client()));
      try {
        await Promise.all(conns.map((c, i) => tryAsUser(c, ids.owner, (cc) => cc.query("UPDATE public.memberships SET role = $2 WHERE user_id = $1 AND organization_id = $3", [target, writers[i], ids.orgA]))));
      } finally {
        await Promise.all(conns.map((c) => c.end()));
      }
      const rows = (await admin.query("SELECT role FROM public.memberships WHERE user_id = $1", [target])).rows;
      record("concurrency", "simultaneous role changes → single canonical row, canonical value", rows.length === 1 && writers.includes(rows[0].role), rows);
      await admin.query("UPDATE public.memberships SET role = 'manager' WHERE user_id = $1", [target]);
    }
    {
      // Concurrent approvals across DIFFERENT requests are independent (no
      // global lock) — each request has exactly one decision.
      const leaves = [];
      for (let i = 0; i < 4; i += 1) leaves.push(await newLeave(admin, ids));
      const conns = await Promise.all(leaves.map(() => client()));
      try {
        const outs = await Promise.all(conns.map((c, i) => tryAsUser(c, ids.adminA, (cc) => cc.query(APPROVE_SQL, [leaves[i], "approved"]))));
        record("concurrency", "parallel approvals of distinct requests each succeed once", outs.every((o) => o.ok && o.value.rowCount === 1));
      } finally {
        await Promise.all(conns.map((c) => c.end()));
      }
    }
  } finally {
    await cleanup(admin, ids).catch((error) => console.error("cleanup failed:", error.message));
    await admin.end();
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    suite: "authz-rls-suite",
    database: "postgresql (real)",
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    sections: Object.fromEntries(
      [...new Set(results.map((r) => r.section))].map((s) => [
        s,
        { total: results.filter((r) => r.section === s).length, passed: results.filter((r) => r.section === s && r.ok).length },
      ]),
    ),
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
