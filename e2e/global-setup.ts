import { createClient, type Session } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createAdminClient,
  ensureE2eMembership,
  ensureTestUser,
  seedBaselineData,
} from "./utils/supabase-test-seed";

/**
 * Runs once before every test worker spins up. Responsibilities:
 *   1. Ensure a dedicated E2E user exists in Supabase Auth.
 *   2. Obtain a live session for that user.
 *   3. Persist the session as a Playwright storageState file so every test
 *      starts authenticated.
 *   4. Seed deterministic baseline data.
 */

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}

interface StorageStateOrigin {
  origin: string;
  localStorage: { name: string; value: string }[];
}

interface StorageState {
  cookies: StorageStateCookie[];
  origins: StorageStateOrigin[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}".`);
  }
  return value;
}

/**
 * Encodes a Supabase session into the same format supabase-js / @supabase/ssr
 * persist under the `sb-<ref>-auth-token` cookie / localStorage key.
 */
function encodeAuthToken(session: Session): string {
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  return `base64-${Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64",
  )}`;
}

function buildStorageState(params: {
  session: Session;
  projectRef: string;
  baseUrl: string;
}): StorageState {
  const { session, projectRef, baseUrl } = params;
  const token = encodeAuthToken(session);
  const cookieName = `sb-${projectRef}-auth-token`;

  let hostname: string;
  let secure: boolean;
  try {
    const url = new URL(baseUrl);
    hostname = url.hostname;
    secure = url.protocol === "https:";
  } catch {
    throw new Error(`Invalid E2E_BASE_URL "${baseUrl}".`);
  }

  return {
    cookies: [
      {
        name: cookieName,
        value: token,
        domain: hostname,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin: baseUrl,
        localStorage: [{ name: cookieName, value: token }],
      },
    ],
  };
}

export default async function globalSetup(): Promise<void> {
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  // Hermetic mode: when Supabase is not configured (demo-mode development),
  // persist an empty storage state so specs that only need the demo identity
  // (copilot-agent, rbac-boundaries, realtime-sync) run without a live stack.
  if (!hasSupabaseEnv) {
    const stateDir = path.join(process.cwd(), "e2e", ".auth");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      path.join(stateDir, "storageState.json"),
      JSON.stringify({ cookies: [], origins: [] }),
      "utf8",
    );
    return;
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = requireEnv("SUPABASE_PROJECT_REF");
  const email = requireEnv("E2E_TEST_USER_EMAIL");
  const password = requireEnv("E2E_TEST_USER_PASSWORD");
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  const admin = createAdminClient();

  const testUser = await ensureTestUser(admin, email, password);
  await ensureE2eMembership(admin, testUser.id);

  // Obtain a session for the test user so the browser can start authenticated.
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.session) {
    throw new Error(
      `Failed to establish a session for the E2E user: ${
        signInError?.message ?? "no session returned"
      }`,
    );
  }

  const storageState = buildStorageState({
    session: signInData.session,
    projectRef,
    baseUrl,
  });

  const stateDir = path.join(process.cwd(), "e2e", ".auth");
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    path.join(stateDir, "storageState.json"),
    JSON.stringify(storageState, null, 2),
    "utf8",
  );

  await seedBaselineData(admin);
}
