import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getLicenseState } from "@/lib/license";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { MAX_TRIAL_SEATS, type LicenseState } from "@/lib/license-format";

/**
 * Dynamic seat-capacity engine.
 *
 * Seats are computed LIVE at check time (never cached across requests, except
 * per-request via React `cache`) so adding or removing an employee or team
 * member immediately re-evaluates available capacity — no stale counters, no
 * false 403s.
 *
 * Billable seats = active employees (anything except `terminated`/`archived`)
 * plus organization members that are not themselves employees, EXCLUDING
 * mock/system seed accounts (demo fixtures, seed datasets, system bots) so
 * seeded/default data never consumes trial capacity.
 *
 * Fail-open policy: if a capacity read fails (missing table, connection
 * error), we return `used = 0` instead of blocking writes — a capacity
 * outage must never take onboarding down with it.
 */

export interface SeatCapacity {
  /** License tier driving the cap: TRIAL | PRO | ENTERPRISE | NONE | DEMO */
  tier: string;
  /** Maximum billable seats allowed. Infinity when unlimited. */
  limit: number;
  /** Currently used billable seats (system accounts excluded). */
  used: number;
  /** Seats still available. */
  available: number;
  /** True when the tier actually enforces a cap. */
  limited: boolean;
  /** True when Supabase is unconfigured (demo mode — never enforced). */
  demoMode: boolean;
  /** System/mock accounts excluded from the billable count. */
  systemAccountsExcluded: number;
  /** Active employees counted (after exclusions). */
  employeeSeats: number;
  /** Additional members counted (after exclusions). */
  memberSeats: number;
}

/** Error thrown by {@link assertSeatCapacity} when the org is over capacity. */
export class SeatCapacityError extends Error {
  readonly code = "SEAT_CAPACITY";
  readonly capacity: SeatCapacity;

  constructor(capacity: SeatCapacity) {
    super(
      `Seat capacity reached (${capacity.used} of ${capacity.limit} seats used). ` +
        `Remove inactive members or upgrade your license to add more seats.`,
    );
    this.name = "SeatCapacityError";
    this.capacity = capacity;
  }
}

/**
 * Email patterns identifying mock/system seed accounts. These never count as
 * billable seats: the deterministic demo fixtures, seed datasets and system
 * bots all use reserved addresses.
 */
const SYSTEM_EMAIL_PATTERNS: RegExp[] = [
  /@fluxentiq\.test$/i,
  /^[+._-]?(demo|seed|system|bot|no-?reply|admin@fluxentiq)[+._-]/i,
  /^system[+._-]/i,
];

/** True when an email belongs to a mock/system seed account. */
export function isSystemAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  return SYSTEM_EMAIL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Resolves the seat cap for a license state. */
export function seatLimitForLicense(
  license: LicenseState | null,
): { limit: number; limited: boolean; tier: string } {
  if (!license) {
    return { limit: Number.POSITIVE_INFINITY, limited: false, tier: "NONE" };
  }
  if (license.tier === "TRIAL") {
    // Trial is always capped at MAX_TRIAL_SEATS — a stale `maxUsers` written
    // by an older build (10) must never re-shrink the cap.
    return { limit: MAX_TRIAL_SEATS, limited: true, tier: "TRIAL" };
  }
  const maxUsers =
    Number.isFinite(license.maxUsers) && license.maxUsers > 0
      ? license.maxUsers
      : Number.POSITIVE_INFINITY;
  return { limit: maxUsers, limited: Number.isFinite(maxUsers), tier: license.tier };
}

interface UsageCount {
  used: number;
  systemAccountsExcluded: number;
  employeeSeats: number;
  memberSeats: number;
}

/**
 * Counts billable seats for an organization. Cached per-request so multiple
 * actions in one render share a single snapshot, but always re-evaluated on
 * the next request.
 */
export const getSeatUsage = cache(
  async (organizationId: string): Promise<UsageCount> => {
    const empty: UsageCount = {
      used: 0,
      systemAccountsExcluded: 0,
      employeeSeats: 0,
      memberSeats: 0,
    };
    if (!organizationId) return empty;

    let supabase: ReturnType<typeof serverClient>;
    try {
      supabase = serverClient();
    } catch {
      // Supabase unconfigured (demo mode) — no seats to count.
      return empty;
    }
    const employeeEmails = new Set<string>();

    // 1) Employees — billable unless terminated/archived.
    let activeEmployees: Array<{
      work_email?: string | null;
      personal_email?: string | null;
    }> = [];
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, work_email, personal_email, status")
        .eq("organization_id", organizationId)
        .not("status", "in", '("terminated","archived")');
      if (!error && data) {
        activeEmployees = data;
      }
    } catch {
      // Fail open — see module docs.
    }
    for (const employee of activeEmployees) {
      if (employee.work_email) employeeEmails.add(employee.work_email.toLowerCase());
      if (employee.personal_email) employeeEmails.add(employee.personal_email.toLowerCase());
    }
    const excludedEmployees = activeEmployees.filter((employee) =>
      isSystemAccountEmail(employee.work_email ?? employee.personal_email),
    ).length;
    const employeeSeats = Math.max(0, activeEmployees.length - excludedEmployees);

    // 2) Members — organization memberships not covered by an employee record.
    let memberUserIds: string[] = [];
    try {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("organization_id", organizationId);
      if (!error && data) {
        memberUserIds = Array.from(
          new Set(data.map((row) => row.user_id).filter(Boolean)),
        );
      }
    } catch {
      memberUserIds = [];
    }

    let memberEmails: string[] = [];
    if (memberUserIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, email")
          .in("id", memberUserIds);
        if (!error && data) {
          memberEmails = data
            .map((user) => user.email)
            .filter((email): email is string => Boolean(email));
        }
      } catch {
        memberEmails = [];
      }
    }

    let memberSeats = 0;
    for (const email of memberEmails) {
      if (isSystemAccountEmail(email)) continue;
      if (employeeEmails.has(email.toLowerCase())) continue; // already an employee seat
      memberSeats += 1;
    }

    return {
      used: employeeSeats + memberSeats,
      systemAccountsExcluded: excludedEmployees,
      employeeSeats,
      memberSeats,
    };
  },
);

/** Full capacity snapshot for the current user's organization. */
export async function getSeatCapacity(): Promise<SeatCapacity> {
  const demoMode = !hasSupabaseEnv();
  const license = await getLicenseState().catch(() => null);
  const { limit, limited, tier } = demoMode
    ? { limit: Number.POSITIVE_INFINITY, limited: false, tier: "DEMO" }
    : seatLimitForLicense(license);

  const user = await getCurrentUser();
  const usage = await getSeatUsage(user.organizationId ?? "");

  return {
    tier,
    limit,
    used: usage.used,
    available: Math.max(0, limit - usage.used),
    limited,
    demoMode,
    systemAccountsExcluded: usage.systemAccountsExcluded,
    employeeSeats: usage.employeeSeats,
    memberSeats: usage.memberSeats,
  };
}

/**
 * Throws {@link SeatCapacityError} when the current organization is over its
 * seat cap. Re-evaluates usage live on every call — the intended guard for
 * employee and team-member creation paths.
 */
export async function assertSeatCapacity(): Promise<SeatCapacity> {
  const capacity = await getSeatCapacity();
  if (capacity.limited && capacity.used >= capacity.limit) {
    throw new SeatCapacityError(capacity);
  }
  return capacity;
}
