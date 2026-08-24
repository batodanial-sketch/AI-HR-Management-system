import { expect, test } from "@playwright/test";

/**
 * Python bridge job polling.
 *
 * Dispatches an asynchronous scraping job through the Next.js proxy
 * (`POST /api/ai/engine/scrape/url` → bridge `/api/engine/scrape/url`), which
 * returns HTTP 202 + `job_id`, then polls `GET /api/ai/jobs/{jobId}` until the
 * job transitions to `completed`.
 *
 * Preconditions (documented in playwright.config.ts):
 *   - The bridge is running on :8000 with `BRIDGE_SECRET_KEY` set (Next.js
 *     forwards `X-Bridge-Secret` automatically).
 *   - `PYTHON_BRIDGE_ALLOWED_SCRAPE_HOSTS` includes `example.com` so the
 *     scrape succeeds end-to-end.
 *   - The test runs with the authenticated storageState (session cookie) plus
 *     an explicit trial cookie so the middleware license gate admits `/api/ai/*`.
 */

interface JobStatus {
  job_id: string;
  status: string;
  result?: unknown;
  error?: string | null;
}

test.describe("Python bridge job polling", () => {
  test("dispatches a scrape job and polls it to completion", async ({
    context,
    request,
  }) => {
    // The license gate requires a trial/license cookie; add it to the shared
    // context so the `request` fixture carries it alongside the session cookie.
    await context.addCookies([
      {
        name: "fluxentiq.trial",
        value: "valid",
        url: "http://localhost:3000",
      },
    ]);

    // 1. Dispatch the async job via the Next.js proxy.
    const dispatch = await request.post("/api/ai/engine/scrape/url", {
      data: { url: "https://example.com" },
    });
    expect(dispatch.status()).toBe(202);

    const accepted = (await dispatch.json()) as {
      accepted: boolean;
      job_id: string;
    };
    expect(accepted.accepted).toBe(true);
    const jobId = accepted.job_id;
    expect(jobId).toMatch(/^[0-9a-f]{32}$/);

    // 2. Poll until the job completes (pending/running → completed).
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/ai/jobs/${jobId}`);
          expect(res.ok()).toBeTruthy();
          const job = (await res.json()) as JobStatus;
          return job.status;
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe("completed");

    // 3. The completed job carries a result (scraped title/text/host).
    const finalRes = await request.get(`/api/ai/jobs/${jobId}`);
    const final = (await finalRes.json()) as JobStatus;
    expect(final.status).toBe("completed");
    expect(final.error).toBeNull();
    expect(final.result).toBeTruthy();
  });

  test("polling an unknown job id returns 404", async ({ context, request }) => {
    await context.addCookies([
      { name: "fluxentiq.trial", value: "valid", url: "http://localhost:3000" },
    ]);

    const res = await request.get(`/api/ai/jobs/${"0".repeat(32)}`);
    expect(res.status()).toBe(404);
  });
});
