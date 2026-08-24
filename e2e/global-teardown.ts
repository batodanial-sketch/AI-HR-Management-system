import { rm } from "node:fs/promises";
import path from "node:path";
import {
  cleanupBaselineData,
  createAdminClient,
  deleteTestUser,
} from "./utils/supabase-test-seed";

/**
 * Runs once after all tests complete. Removes every E2E-tagged row from the
 * canonical Supabase database, deletes the dedicated test user, and clears the
 * generated storageState file so no authenticated artifact lingers locally.
 */
export default async function globalTeardown(): Promise<void> {
  const email = process.env.E2E_TEST_USER_EMAIL;
  const admin = createAdminClient();

  await cleanupBaselineData(admin);

  if (email) {
    await deleteTestUser(admin, email);
  }

  await rm(path.join(process.cwd(), "e2e", ".auth"), {
    recursive: true,
    force: true,
  });
}
