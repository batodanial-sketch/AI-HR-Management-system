import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Realtime dashboard feed — UI auto-updates on table mutations.
 *
 * Two modes:
 *
 *   1. Hermetic (this environment): verifies the defensive fallback contract
 *      — the Expenses feed renders server data, the realtime hook degrades to
 *      idle without a WebSocket, and no page errors surface.
 *
 *   2. Live stack (CI with Supabase env vars): inserts a real expense row via
 *      the service-role client and asserts the row appears on screen through
 *      the realtime subscription → router.refresh() loop.
 */

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
);

const E2E_ORG_ID = "11111111-1111-4111-8111-111111111111";

test.describe("Realtime dashboard feed", () => {
  test("expenses feed renders and degrades gracefully without realtime", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/expenses");

    // Server-rendered feed is present (seed fallback in demo mode).
    await expect(page.getByTestId("expenses-table")).toBeVisible();
    await expect(page.getByTestId("expenses-table")).toContainText("Priya Nair");

    // The realtime hook must degrade silently — no console errors, no crash.
    await page.waitForTimeout(1_000);
    expect(pageErrors).toEqual([]);
  });

  test("table mutations refresh the UI via Supabase Realtime", async ({ page }) => {
    test.skip(
      !hasSupabaseEnv,
      "Live-mutation check requires a configured Supabase stack (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).",
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceKey = (process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY) as string;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve a real employee for the FK-bound expense row.
    const { data: employee } = await admin
      .from("employees")
      .select("id")
      .eq("organization_id", E2E_ORG_ID)
      .limit(1)
      .maybeSingle();
    test.skip(!employee, "No seeded employee for the E2E org.");

    const merchant = `Realtime E2E ${Date.now()}`;
    await page.goto("/expenses");
    await expect(page.getByTestId("expenses-table")).toBeVisible();

    // Mutate the table from outside the browser (as a workflow/webhook would).
    const { error: insertError } = await admin.from("expense_reports").insert({
      organization_id: E2E_ORG_ID,
      employee_id: employee.id,
      merchant,
      category: "Software",
      amount: 41,
      currency_code: "USD",
      status: "pending",
    });
    expect(insertError).toBeNull();

    try {
      // The realtime subscription fires → debounced router.refresh() → the
      // new row appears without any manual navigation.
      await expect(page.getByText(merchant)).toBeVisible({ timeout: 20_000 });
    } finally {
      await admin.from("expense_reports").delete().eq("merchant", merchant);
    }
  });
});
