import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { adminClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit";

/**
 * SCIM 2.0 provisioning engine (Okta / Azure AD / Google Workspace).
 *
 * The `/api/scim/v2/[tenantId]` route authenticates bearer tokens and calls
 * into this module, which drives Supabase Auth + membership state through the
 * service-role client:
 *
 *   - user creation    → auth user (email confirmed, SSO-login) + active
 *                        membership with the requested role
 *   - role assignment  → membership role update (role catalog codes)
 *   - deprovisioning   → membership deactivated (+ optional hard delete)
 *   - groups           → role groups with member lists
 *
 * Everything is tenant-scoped by the `tenantId` route segment (resolved to an
 * organization slug/id) and lands in the audit trail as actor_type SYSTEM.
 */

export interface ScimUser {
  id: string;
  userName: string;
  displayName?: string;
  active: boolean;
  role?: string;
  externalId?: string;
}

export interface ScimGroup {
  id: string;
  displayName: string;
  members: Array<{ value: string }>;
}

export interface ScimError {
  status: number;
  scimType?: string;
  detail: string;
}

export class ScimErrorResponse extends Error {
  readonly status: number;
  readonly scimType?: string;

  constructor(status: number, detail: string, scimType?: string) {
    super(detail);
    this.name = "ScimErrorResponse";
    this.status = status;
    this.scimType = scimType;
  }
}

/* ── SCIM envelope helpers ──────────────────────────────────────────────── */

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export function scimErrorBody(status: number, detail: string, scimType?: string): object {
  return {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}

/* ── Tenant + bearer resolution ─────────────────────────────────────────── */

export function verifyScimBearer(
  tenantId: string,
  authorization: string | null,
): boolean {
  const presented = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!presented) return false;

  const tokenKey = `SCIM_TOKEN_${tenantId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  const expected =
    process.env[tokenKey] ?? process.env.SCIM_BEARER_TOKEN ?? "";
  if (!expected) return false;

  const a = createHmac("sha256", "fluxentiq-scim").update(presented).digest();
  const b = createHmac("sha256", "fluxentiq-scim").update(expected).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

async function resolveOrganization(tenantId: string): Promise<{ id: string; slug: string }> {
  const { data, error } = await adminClient()
    .from("organizations")
    .select("id, slug")
    .or(`slug.eq.${tenantId},id.eq.${tenantId}`)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new ScimErrorResponse(404, `Tenant '${tenantId}' was not found.`, "invalidValue");
  }
  return { id: String(data.id), slug: String(data.slug ?? tenantId) };
}

/* ── User lifecycle ─────────────────────────────────────────────────────── */

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .schema("auth")
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase())
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return String(data.id);
}

const ROLE_CODES = new Set(["super_admin", "hr_admin", "manager", "employee", "member"]);

function normalizeRoleCode(raw: unknown): string {
  const value = String(raw ?? "employee").toLowerCase().trim();
  return ROLE_CODES.has(value) ? value : "employee";
}

export async function scimListUsers(tenantId: string): Promise<ScimUser[]> {
  if (!hasSupabaseEnv()) {
    throw new ScimErrorResponse(503, "SCIM provisioning is disabled — Supabase is not configured.");
  }
  const org = await resolveOrganization(tenantId);
  const { data, error } = await adminClient().rpc("scim_list_memberships", {
    p_org: org.id,
  });
  if (error) {
    throw new ScimErrorResponse(500, `Unable to list provisioned users: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    user_id: string;
    email: string;
    role_code: string;
    active: boolean;
    scim_external_id: string | null;
  }>;
  return rows.map((row) => ({
    id: row.user_id,
    userName: row.email,
    active: row.active,
    role: row.role_code,
    ...(row.scim_external_id ? { externalId: row.scim_external_id } : {}),
  }));
}

/** Creates (or reactivates) a provisioned user with a role assignment. */
export async function scimProvisionUser(
  tenantId: string,
  input: {
    userName: string;
    displayName?: string;
    active?: boolean;
    role?: string;
    externalId?: string;
  },
): Promise<ScimUser> {
  if (!hasSupabaseEnv()) {
    throw new ScimErrorResponse(503, "SCIM provisioning is disabled — Supabase is not configured.");
  }
  const org = await resolveOrganization(tenantId);
  const email = input.userName.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new ScimErrorResponse(400, "userName must be a valid email address.", "invalidValue");
  }

  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    // First-time provisioning: create an SSO-ready auth user with a random
    // password (login flows through the IdP) and confirmed email.
    const password = randomBytes(24).toString("base64url");
    const { data: created, error } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        scim_external_id: input.externalId ?? null,
        scim_provisioned: true,
      },
    });
    if (error || !created.user) {
      throw new ScimErrorResponse(
        409,
        `Unable to create user: ${error?.message ?? "unknown error"}`,
        "uniqueness",
      );
    }
    userId = created.user.id;
  }

  const roleCode = normalizeRoleCode(input.role);
  const { error: membershipError } = await adminClient().rpc("scim_assign_membership", {
    p_org: org.id,
    p_user: userId,
    p_role_code: roleCode,
    p_active: input.active !== false,
  });
  if (membershipError) {
    throw new ScimErrorResponse(500, `Unable to assign membership: ${membershipError.message}`);
  }

  await recordAuditLog(
    {
      actorId: "scim",
      actorType: "SYSTEM",
      action: `scim.user.${userId ? "update" : "create"}`,
      targetModule: "directory",
      targetId: userId,
      changes: { email, role: roleCode, active: input.active !== false },
      organizationId: org.id,
    },
    { useAdmin: true },
  );

  return {
    id: userId,
    userName: email,
    displayName: input.displayName,
    active: input.active !== false,
    role: roleCode,
    ...(input.externalId ? { externalId: input.externalId } : {}),
  };
}

/** Updates role/active state for a provisioned user (idempotent). */
export async function scimUpdateUser(
  tenantId: string,
  userId: string,
  patch: { active?: boolean; role?: string; displayName?: string },
): Promise<ScimUser | null> {
  if (!hasSupabaseEnv()) {
    throw new ScimErrorResponse(503, "SCIM provisioning is disabled — Supabase is not configured.");
  }
  const org = await resolveOrganization(tenantId);

  if (patch.role) {
    const roleCode = normalizeRoleCode(patch.role);
    const { error } = await adminClient().rpc("scim_assign_membership", {
      p_org: org.id,
      p_user: userId,
      p_role_code: roleCode,
      p_active: patch.active !== false,
    });
    if (error) {
      throw new ScimErrorResponse(500, `Unable to update membership: ${error.message}`);
    }
  } else if (patch.active === false) {
    const { error } = await adminClient().rpc("scim_assign_membership", {
      p_org: org.id,
      p_user: userId,
      p_role_code: "employee",
      p_active: false,
    });
    if (error) {
      throw new ScimErrorResponse(500, `Unable to deactivate membership: ${error.message}`);
    }
  }

  await recordAuditLog(
    {
      actorId: "scim",
      actorType: "SYSTEM",
      action: "scim.user.update",
      targetModule: "directory",
      targetId: userId,
      changes: patch,
      organizationId: org.id,
    },
    { useAdmin: true },
  );

  return { id: userId, userName: "", displayName: patch.displayName, active: patch.active !== false, role: patch.role };
}

/** Deprovisions a user: membership deactivated; sessions revoked; optional
 * hard delete (SCIM_HARD_DELETE_USERS=1). Idempotent — returns null when the
 * user has no membership in this tenant. */
export async function scimDeprovisionUser(tenantId: string, userId: string): Promise<void> {
  if (!hasSupabaseEnv()) {
    throw new ScimErrorResponse(503, "SCIM provisioning is disabled — Supabase is not configured.");
  }
  const org = await resolveOrganization(tenantId);

  const { data: membership } = await adminClient()
    .from("organization_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", org.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    const { error } = await adminClient()
      .from("organization_memberships")
      .update({ status: "inactive" })
      .eq("id", membership.id);
    if (error) {
      throw new ScimErrorResponse(500, `Unable to deactivate membership: ${error.message}`);
    }
  }

  // Revoke all live sessions for the user (global sign-out).
  await adminClient().auth.admin.signOut(userId, "global").catch(() => undefined);

  if (process.env.SCIM_HARD_DELETE_USERS === "1") {
    await adminClient().auth.admin.deleteUser(userId).catch(() => undefined);
  }

  await recordAuditLog(
    {
      actorId: "scim",
      actorType: "SYSTEM",
      action: "scim.user.deprovision",
      targetModule: "directory",
      targetId: userId,
      changes: { deactivated: Boolean(membership), hardDeleted: process.env.SCIM_HARD_DELETE_USERS === "1" },
      organizationId: org.id,
    },
    { useAdmin: true },
  );
}

/* ── Groups (role groups) ───────────────────────────────────────────────── */

export async function scimListGroups(tenantId: string): Promise<ScimGroup[]> {
  const users = await scimListUsers(tenantId);
  const roles = [...new Set(users.map((user) => user.role ?? "employee"))];
  return roles.map((role) => ({
    id: `role:${role}`,
    displayName: role.replaceAll("_", "-"),
    members: users
      .filter((user) => (user.role ?? "employee") === role)
      .map((user) => ({ value: user.id })),
  }));
}

/** Maps a SCIM group (role) onto its members — role assignment in bulk. */
export async function scimSyncGroup(
  tenantId: string,
  group: { id?: string; displayName?: string; members?: Array<{ value: string }> },
): Promise<ScimGroup> {
  const roleCode = normalizeRoleCode(String(group.displayName ?? group.id ?? "employee").replaceAll("-", "_"));
  const memberIds = (group.members ?? []).map((member) => member.value);
  for (const userId of memberIds) {
    await scimUpdateUser(tenantId, userId, { role: roleCode, active: true });
  }
  return {
    id: `role:${roleCode}`,
    displayName: roleCode.replaceAll("_", "-"),
    members: memberIds.map((value) => ({ value })),
  };
}

export { SCIM_USER_SCHEMA, SCIM_GROUP_SCHEMA, SCIM_ERROR_SCHEMA };
