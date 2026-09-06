/**
 * Canonical organization-membership role model — pure, dependency-free.
 *
 * This module is the ONLY place that defines:
 *   - the set of legitimate canonical role codes (`memberships.role`)
 *   - the mapping canonical role code → RBAC tier
 *   - the rule for selecting the single authoritative membership row
 *
 * It is deliberately free of I/O so the fail-closed semantics can be proven
 * with unit tests. The server-side resolver (`lib/authz/canonical.ts`) feeds
 * it the raw `memberships` rows and the server-pinned tenant claim; every
 * other authorization layer consumes the resolver's result and never reads
 * membership tables directly.
 *
 * Authoritative source of truth (schema): `public.memberships`
 *   user_id → organization_id → role (org_role: owner | admin | manager | member)
 *
 * `organization_memberships.role_id → roles.code` is NOT authoritative and
 * must not be consulted for authorization anywhere in the application.
 */

/** Canonical role codes — exactly the `org_role` enum values in the schema. */
export const CANONICAL_ROLE_CODES = ["owner", "admin", "manager", "member"] as const;
export type CanonicalRoleCode = (typeof CANONICAL_ROLE_CODES)[number];

/** RBAC tiers. Every effective role is one of these — nothing else. */
export type RbRole = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";

/** Role precedence — higher = more access. */
export const ROLE_HIERARCHY: Record<RbRole, number> = {
  EMPLOYEE: 1,
  MANAGER: 2,
  HR_ADMIN: 3,
  SUPER_ADMIN: 4,
};

export const RB_ROLES: RbRole[] = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];

/** The one canonical role-code → tier mapping. */
export const ROLE_CODE_TO_TIER: Record<CanonicalRoleCode, RbRole> = {
  owner: "SUPER_ADMIN",
  admin: "HR_ADMIN",
  manager: "MANAGER",
  member: "EMPLOYEE",
};

/** Result of resolving the caller's canonical membership. */
export interface CanonicalMembership {
  userId: string;
  organizationId: string;
  /** `memberships.id` — the authoritative membership row. */
  membershipId: string;
  /** Canonical role code exactly as stored (`memberships.role`). */
  roleCode: CanonicalRoleCode;
  /** RBAC tier derived from `roleCode` via {@link ROLE_CODE_TO_TIER}. */
  role: RbRole;
}

export type AuthzDenyReason =
  | "UNAUTHENTICATED"
  | "NO_MEMBERSHIP"
  | "AMBIGUOUS_MEMBERSHIP"
  | "UNKNOWN_ROLE"
  | "MALFORMED_MEMBERSHIP"
  | "RESOLVER_ERROR";

export type AuthzResolution =
  | { ok: true; membership: CanonicalMembership }
  | { ok: false; reason: AuthzDenyReason; detail?: string };

/** Raw shape of a `memberships` row as returned by the database. */
export interface RawMembershipRow {
  id: unknown;
  user_id: unknown;
  organization_id: unknown;
  role: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Strict role-code validation. Returns `null` for anything that is not an
 * exact canonical code — there is intentionally NO default. Legacy aliases
 * (`hr_admin`, `super_admin`, …) are not accepted here: the database layer is
 * the place to migrate stored values, not the authorization path.
 */
export function parseCanonicalRoleCode(value: unknown): CanonicalRoleCode | null {
  if (typeof value !== "string") return null;
  return (CANONICAL_ROLE_CODES as readonly string[]).includes(value)
    ? (value as CanonicalRoleCode)
    : null;
}

/** Tier for a canonical role code. */
export function tierForRoleCode(code: CanonicalRoleCode): RbRole {
  return ROLE_CODE_TO_TIER[code];
}

/** True when `role` is at least `minimum` in the hierarchy. */
export function roleAtLeast(role: RbRole, minimum: RbRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}

/** True for roles allowed to perform org-wide HR administration. */
export function isPrivilegedRoleCode(code: CanonicalRoleCode | string | null | undefined): boolean {
  const parsed = parseCanonicalRoleCode(code);
  return parsed !== null && roleAtLeast(tierForRoleCode(parsed), "HR_ADMIN");
}

/**
 * Selects the single authoritative membership for an authenticated user.
 *
 * Rules (fail closed):
 *   - `userId` must be a UUID (forged/blank actor ids never resolve).
 *   - Every row must belong to `userId` (rows for other users → malformed —
 *     the resolver filtered by user, so this indicates a cross-tenant leak).
 *   - Zero rows → NO_MEMBERSHIP.
 *   - One row → that row.
 *   - Several rows → only a server-pinned `activeOrganizationId` (written by
 *     the server into auth `app_metadata`, never client-supplied) may pick
 *     one; it must match exactly one row. Otherwise AMBIGUOUS_MEMBERSHIP.
 *   - Selected row must carry UUID ids and an exact canonical role code.
 */
export function selectCanonicalMembership(input: {
  userId: unknown;
  rows: RawMembershipRow[] | null | undefined;
  /** Server-pinned tenant claim (auth.app_metadata.organization_id) or null. */
  activeOrganizationId?: unknown;
}): AuthzResolution {
  if (!isUuid(input.userId)) {
    return { ok: false, reason: "UNAUTHENTICATED", detail: "actor id is not a valid user id" };
  }
  const userId = input.userId;
  const rows = Array.isArray(input.rows) ? input.rows : [];

  if (rows.some((row) => row.user_id !== userId)) {
    return {
      ok: false,
      reason: "MALFORMED_MEMBERSHIP",
      detail: "membership rows for a different user were returned",
    };
  }

  if (rows.length === 0) {
    return { ok: false, reason: "NO_MEMBERSHIP" };
  }

  let selected: RawMembershipRow | null = null;
  if (rows.length === 1) {
    selected = rows[0];
  } else {
    const pinned = isUuid(input.activeOrganizationId) ? input.activeOrganizationId : null;
    if (!pinned) {
      return {
        ok: false,
        reason: "AMBIGUOUS_MEMBERSHIP",
        detail: `${rows.length} memberships and no server-pinned active organization`,
      };
    }
    const matches = rows.filter((row) => row.organization_id === pinned);
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: "AMBIGUOUS_MEMBERSHIP",
        detail:
          matches.length === 0
            ? "pinned organization does not match any membership"
            : "pinned organization matches several membership rows",
      };
    }
    selected = matches[0];
  }

  if (!isUuid(selected.id) || !isUuid(selected.organization_id)) {
    return { ok: false, reason: "MALFORMED_MEMBERSHIP", detail: "membership ids are not UUIDs" };
  }
  const roleCode = parseCanonicalRoleCode(selected.role);
  if (!roleCode) {
    return {
      ok: false,
      reason: "UNKNOWN_ROLE",
      detail: `role ${JSON.stringify(selected.role)} is not a canonical role code`,
    };
  }

  return {
    ok: true,
    membership: {
      userId,
      organizationId: selected.organization_id,
      membershipId: selected.id,
      roleCode,
      role: tierForRoleCode(roleCode),
    },
  };
}

/** Human-readable denial message (no PII, no internal identifiers). */
export function denyMessage(reason: AuthzDenyReason): string {
  switch (reason) {
    case "UNAUTHENTICATED":
      return "Authentication is required.";
    case "NO_MEMBERSHIP":
      return "No organization membership was found for the current user.";
    case "AMBIGUOUS_MEMBERSHIP":
      return "Organization membership is ambiguous; an active organization must be selected server-side.";
    case "UNKNOWN_ROLE":
      return "The membership role is not a recognized canonical role.";
    case "MALFORMED_MEMBERSHIP":
      return "The membership record is malformed.";
    case "RESOLVER_ERROR":
    default:
      return "Unable to resolve organization authorization.";
  }
}
