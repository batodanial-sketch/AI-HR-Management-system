import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

/**
 * Deterministic seeding + cleanup for E2E runs against the canonical Supabase
 * PostgreSQL database (see `supabase/migrations/`). Everything written here is
 * tagged with E2E_MARKER so teardown can remove it without touching production
 * rows, and scoped to a dedicated E2E organization.
 */

export const E2E_MARKER = "e2e";

// Fixed UUIDs (valid v4-format strings) so seeds are deterministic and satisfy
// the uuid primary keys + organization_id NOT NULL constraints.
export const E2E_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const E2E_EMP_ONE = "00000000-0000-4000-8000-00000000e001";
export const E2E_EMP_TWO = "00000000-0000-4000-8000-00000000e002";
export const E2E_EMP_THREE = "00000000-0000-4000-8000-00000000e003";
export const E2E_EMP_CURRENT = "00000000-0000-4000-8000-00000000e0cc";
export const E2E_JOB_POSTING = "00000000-0000-4000-8000-00000000e101";
export const E2E_CAND_ONE = "00000000-0000-4000-8000-00000000e201";
export const E2E_CAND_TWO = "00000000-0000-4000-8000-00000000e202";
export const E2E_CAND_THREE = "00000000-0000-4000-8000-00000000e203";

export type EmploymentStatus = "active" | "on_leave" | "terminated";
export type RecruitmentStage = "applied" | "screening" | "interview" | "offer" | "hired";

export interface EmployeeRow {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  role: string;
  employment_status: EmploymentStatus;
  start_date: string;
  source_tag: string;
}

export interface JobPostingRow {
  id: string;
  organization_id: string;
  title: string;
  department: string;
  location: string;
  status: "open" | "closed";
  source_tag: string;
}

export interface CandidateRow {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_posting_id: string;
  stage: RecruitmentStage;
  source_tag: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}" for E2E seeding.`,
    );
  }
  return value;
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    // New Secret key first, legacy service-role key as fallback.
    process.env.SUPABASE_SECRET_KEY || requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function assertOk(
  table: string,
  error: { message: string } | null,
): Promise<void> {
  if (error) {
    throw new Error(`Failed to seed table "${table}": ${error.message}`);
  }
}

async function ensureE2eOrganization(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("organizations").upsert(
    {
      id: E2E_ORG_ID,
      name: "E2E Test Org",
      slug: "e2e-test-org",
      plan: "free",
    },
    { onConflict: "id" },
  );
  await assertOk("organizations", error);
}

export async function seedBaselineData(admin: SupabaseClient): Promise<void> {
  await ensureE2eOrganization(admin);

  const { error: employeesError } = await admin.from("employees").upsert(
    [
      {
        id: E2E_EMP_ONE,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "EmployeeOne",
        email: "e2e.employee.one@fluxentiq.test",
        department: "Engineering",
        role: "Backend Engineer",
        employment_status: "active",
        start_date: "2024-01-15",
        source_tag: E2E_MARKER,
      },
      {
        id: E2E_EMP_TWO,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "EmployeeTwo",
        email: "e2e.employee.two@fluxentiq.test",
        department: "Design",
        role: "Product Designer",
        employment_status: "active",
        start_date: "2023-09-01",
        source_tag: E2E_MARKER,
      },
      {
        id: E2E_EMP_THREE,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "EmployeeThree",
        email: "e2e.employee.three@fluxentiq.test",
        department: "People Ops",
        role: "HR Business Partner",
        employment_status: "on_leave",
        start_date: "2022-03-22",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  await assertOk("employees", employeesError);

  const { error: jobPostingsError } = await admin.from("job_postings").upsert(
    [
      {
        id: E2E_JOB_POSTING,
        organization_id: E2E_ORG_ID,
        title: "E2E Software Engineer",
        department: "Engineering",
        location: "Remote",
        status: "open",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  await assertOk("job_postings", jobPostingsError);

  const { error: candidatesError } = await admin.from("candidates").upsert(
    [
      {
        id: E2E_CAND_ONE,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "CandidateOne",
        email: "e2e.candidate.one@fluxentiq.test",
        job_posting_id: E2E_JOB_POSTING,
        stage: "applied",
        source_tag: E2E_MARKER,
      },
      {
        id: E2E_CAND_TWO,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "CandidateTwo",
        email: "e2e.candidate.two@fluxentiq.test",
        job_posting_id: E2E_JOB_POSTING,
        stage: "interview",
        source_tag: E2E_MARKER,
      },
      {
        id: E2E_CAND_THREE,
        organization_id: E2E_ORG_ID,
        first_name: "E2E",
        last_name: "CandidateThree",
        email: "e2e.candidate.three@fluxentiq.test",
        job_posting_id: E2E_JOB_POSTING,
        stage: "offer",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  await assertOk("candidates", candidatesError);
}

/**
 * Links the E2E test user to the E2E organization (admin role) so the app's
 * org-scoped reads/writes resolve to the seeded E2E data.
 */
export async function ensureE2eMembership(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.from("memberships").upsert(
    {
      user_id: userId,
      organization_id: E2E_ORG_ID,
      role: "admin",
    },
    { onConflict: "user_id,organization_id" },
  );
  await assertOk("memberships", error);
}

export async function cleanupBaselineData(admin: SupabaseClient): Promise<void> {
  const { error: candidatesError } = await admin
    .from("candidates")
    .delete()
    .eq("source_tag", E2E_MARKER);
  await assertOk("candidates", candidatesError);

  const { error: jobPostingsError } = await admin
    .from("job_postings")
    .delete()
    .eq("source_tag", E2E_MARKER);
  await assertOk("job_postings", jobPostingsError);

  const { error: employeesError } = await admin
    .from("employees")
    .delete()
    .eq("source_tag", E2E_MARKER);
  await assertOk("employees", employeesError);

  const { error: orgError } = await admin
    .from("organizations")
    .delete()
    .eq("id", E2E_ORG_ID);
  await assertOk("organizations", orgError);
}

export async function findTestUser(
  admin: SupabaseClient,
  email: string,
): Promise<User | undefined> {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    throw new Error(`Failed to list Supabase users: ${error.message}`);
  }
  return data.users.find((user) => user.email === email);
}

export async function ensureTestUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<User> {
  const existing = await findTestUser(admin, email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`Failed to reset test user password: ${error.message}`);
    }
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }
  return data.user;
}

export async function deleteTestUser(
  admin: SupabaseClient,
  email: string,
): Promise<void> {
  const existing = await findTestUser(admin, email);
  if (!existing) {
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) {
    throw new Error(`Failed to delete test user: ${error.message}`);
  }
}
