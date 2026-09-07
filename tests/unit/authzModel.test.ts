/**
 * Phase R1 — canonical role model: fail-closed semantics.
 *
 * Exercises `selectCanonicalMembership` (the pure core of the canonical
 * resolver) with every valid role and every invalid/forged shape. The
 * expected result for anything that is not a single, well-formed, canonical
 * membership belonging to the authenticated actor is DENY — never `member`.
 */
import {
  CANONICAL_ROLE_CODES,
  ROLE_CODE_TO_TIER,
  denyMessage,
  isPrivilegedRoleCode,
  parseCanonicalRoleCode,
  roleAtLeast,
  selectCanonicalMembership,
  type RawMembershipRow,
} from "@/lib/authz/model";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MID = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

function row(over: Partial<RawMembershipRow> = {}): RawMembershipRow {
  return { id: MID(1), user_id: USER, organization_id: ORG_A, role: "member", ...over };
}

describe("canonical role model — valid memberships", () => {
  it.each(CANONICAL_ROLE_CODES)("resolves %s to its tier", (code) => {
    const result = selectCanonicalMembership({ userId: USER, rows: [row({ role: code })] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.membership).toEqual({
      userId: USER,
      organizationId: ORG_A,
      membershipId: MID(1),
      roleCode: code,
      role: ROLE_CODE_TO_TIER[code],
    });
  });

  it("uses the server-pinned organization to disambiguate multiple memberships", () => {
    const result = selectCanonicalMembership({
      userId: USER,
      rows: [row({ id: MID(1), organization_id: ORG_A, role: "member" }), row({ id: MID(2), organization_id: ORG_B, role: "admin" })],
      activeOrganizationId: ORG_B,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.membership.organizationId).toBe(ORG_B);
    expect(result.membership.role).toBe("HR_ADMIN");
  });
});

describe("canonical role model — fail closed", () => {
  const deny = (input: Parameters<typeof selectCanonicalMembership>[0]) => {
    const result = selectCanonicalMembership(input);
    expect(result.ok).toBe(false);
    return result.ok ? null : result.reason;
  };

  it("no membership → DENY (not member)", () => {
    expect(deny({ userId: USER, rows: [] })).toBe("NO_MEMBERSHIP");
    expect(deny({ userId: USER, rows: null })).toBe("NO_MEMBERSHIP");
    expect(deny({ userId: USER, rows: undefined })).toBe("NO_MEMBERSHIP");
  });

  it("deleted membership (rows gone) → DENY", () => {
    expect(deny({ userId: USER, rows: [] })).toBe("NO_MEMBERSHIP");
  });

  it("unknown role → DENY", () => {
    expect(deny({ userId: USER, rows: [row({ role: "superuser" })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: "hr_admin" })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: "ADMIN" })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: "" })] })).toBe("UNKNOWN_ROLE");
  });

  it("missing role → DENY", () => {
    expect(deny({ userId: USER, rows: [row({ role: null })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: undefined })] })).toBe("UNKNOWN_ROLE");
  });

  it("forged role shapes (objects/arrays/numbers) → DENY", () => {
    expect(deny({ userId: USER, rows: [row({ role: { code: "owner" } })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: ["owner"] })] })).toBe("UNKNOWN_ROLE");
    expect(deny({ userId: USER, rows: [row({ role: 1 })] })).toBe("UNKNOWN_ROLE");
  });

  it("malformed membership/org ids → DENY", () => {
    expect(deny({ userId: USER, rows: [row({ id: "not-a-uuid" })] })).toBe("MALFORMED_MEMBERSHIP");
    expect(deny({ userId: USER, rows: [row({ organization_id: "org-1" })] })).toBe("MALFORMED_MEMBERSHIP");
    expect(deny({ userId: USER, rows: [row({ organization_id: null })] })).toBe("MALFORMED_MEMBERSHIP");
  });

  it("conflicting memberships without a server-pinned org → DENY", () => {
    expect(
      deny({ userId: USER, rows: [row({ id: MID(1), organization_id: ORG_A }), row({ id: MID(2), organization_id: ORG_B })] }),
    ).toBe("AMBIGUOUS_MEMBERSHIP");
  });

  it("pinned org that matches none of the memberships → DENY", () => {
    expect(
      deny({
        userId: USER,
        rows: [row({ id: MID(1), organization_id: ORG_A }), row({ id: MID(2), organization_id: ORG_B })],
        activeOrganizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    ).toBe("AMBIGUOUS_MEMBERSHIP");
  });

  it("duplicate rows for the same org → DENY", () => {
    expect(
      deny({ userId: USER, rows: [row({ id: MID(1), role: "member" }), row({ id: MID(2), role: "owner" })], activeOrganizationId: ORG_A }),
    ).toBe("AMBIGUOUS_MEMBERSHIP");
  });

  it("cross-tenant membership row (belongs to another actor) → DENY", () => {
    expect(deny({ userId: USER, rows: [row({ user_id: OTHER_USER, role: "owner" })] })).toBe("MALFORMED_MEMBERSHIP");
    expect(deny({ userId: USER, rows: [row(), row({ id: MID(2), user_id: OTHER_USER, organization_id: ORG_B, role: "owner" })] })).toBe(
      "MALFORMED_MEMBERSHIP",
    );
  });

  it("forged actor id → DENY", () => {
    expect(deny({ userId: "", rows: [row()] })).toBe("UNAUTHENTICATED");
    expect(deny({ userId: null, rows: [row()] })).toBe("UNAUTHENTICATED");
    expect(deny({ userId: "admin", rows: [row({ user_id: "admin" })] })).toBe("UNAUTHENTICATED");
    expect(deny({ userId: { id: USER }, rows: [row()] })).toBe("UNAUTHENTICATED");
  });

  it("forged/pinned organization id can never grant a membership that does not exist", () => {
    // Single membership: the pinned claim is irrelevant; the membership wins.
    const single = selectCanonicalMembership({ userId: USER, rows: [row()], activeOrganizationId: ORG_B });
    expect(single.ok && single.membership.organizationId).toBe(ORG_A);
    // No membership: a pinned claim does not create one.
    expect(deny({ userId: USER, rows: [], activeOrganizationId: ORG_B })).toBe("NO_MEMBERSHIP");
    // Malformed pinned claim is ignored (treated as absent).
    expect(
      deny({ userId: USER, rows: [row({ id: MID(1), organization_id: ORG_A }), row({ id: MID(2), organization_id: ORG_B })], activeOrganizationId: "x" }),
    ).toBe("AMBIGUOUS_MEMBERSHIP");
  });

  it("stale role (row updated after resolution) is not cached by the pure selector", () => {
    const rows = [row({ role: "owner" })];
    const before = selectCanonicalMembership({ userId: USER, rows });
    rows[0] = row({ role: "member" });
    const after = selectCanonicalMembership({ userId: USER, rows });
    expect(before.ok && before.membership.role).toBe("SUPER_ADMIN");
    expect(after.ok && after.membership.role).toBe("EMPLOYEE");
  });
});

describe("canonical role model — helpers", () => {
  it("parseCanonicalRoleCode accepts only exact canonical codes", () => {
    expect(parseCanonicalRoleCode("owner")).toBe("owner");
    expect(parseCanonicalRoleCode("Owner")).toBeNull();
    expect(parseCanonicalRoleCode("hr_admin")).toBeNull();
    expect(parseCanonicalRoleCode(undefined)).toBeNull();
  });

  it("isPrivilegedRoleCode is HR_ADMIN+ only and never defaults", () => {
    expect(isPrivilegedRoleCode("owner")).toBe(true);
    expect(isPrivilegedRoleCode("admin")).toBe(true);
    expect(isPrivilegedRoleCode("manager")).toBe(false);
    expect(isPrivilegedRoleCode("member")).toBe(false);
    expect(isPrivilegedRoleCode("hr_admin")).toBe(false);
    expect(isPrivilegedRoleCode(null)).toBe(false);
  });

  it("hierarchy is strict and total", () => {
    expect(roleAtLeast("SUPER_ADMIN", "HR_ADMIN")).toBe(true);
    expect(roleAtLeast("HR_ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(roleAtLeast("MANAGER", "HR_ADMIN")).toBe(false);
    expect(roleAtLeast("EMPLOYEE", "EMPLOYEE")).toBe(true);
  });

  it("denial messages never leak identifiers", () => {
    for (const reason of ["UNAUTHENTICATED", "NO_MEMBERSHIP", "AMBIGUOUS_MEMBERSHIP", "UNKNOWN_ROLE", "MALFORMED_MEMBERSHIP", "RESOLVER_ERROR"] as const) {
      expect(denyMessage(reason)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });
});
