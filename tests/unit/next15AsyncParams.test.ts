/**
 * Phase XIII — Next.js 15 async-context regression.
 *
 * Next.js 15 passes `params` to dynamic route handlers as a Promise. Handlers
 * migrated in Phase XIII must await it (and must not read members off the
 * Promise). These tests exercise the migrated `app/api/ai/jobs/[jobId]`
 * handler with a Promise-wrapped context and assert the resolved segment is
 * actually used — with fetch mocked so no network/bridge is involved.
 */

import { GET } from "@/app/api/ai/jobs/[jobId]/route";

// Route handlers import "server-only" guards; harmless in unit context.
jest.mock("server-only", () => ({}));

// The bridge client module pulls a deep authz chain (react.cache) that is not
// available in the plain react 18 unit runtime. This test targets the route's
// async-params contract, so the bridge URL/secret seam is stubbed and the
// route's real request handling + fetch behavior is exercised.
jest.mock("@/lib/ai-proxy", () => ({
  bridgeUrl: () => "http://bridge.test",
  bridgeSecret: () => "unit-test-secret",
}));

const VALID_JOB_ID = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Next 15 async route params (app/api/ai/jobs/[jobId])", () => {
  it("awaits Promise params and forwards the resolved jobId upstream", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ job_id: VALID_JOB_ID, status: "running" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const res = await GET(new Request("http://localhost/api/ai/jobs/xyz"), {
      // Next 15 contract: params is a Promise, not a plain object.
      params: Promise.resolve({ jobId: VALID_JOB_ID }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain(`/api/jobs/${VALID_JOB_ID}`);
  });

  it("still rejects malformed job ids (validation runs after await)", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await GET(new Request("http://localhost/api/ai/jobs/short"), {
      params: Promise.resolve({ jobId: "not-a-32-hex-job-id" }),
    });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a bounded 502 when the bridge is unreachable (no silent hang)", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNREFUSED (simulated bridge outage)"));

    const res = await GET(new Request("http://localhost/api/ai/jobs/xyz"), {
      params: Promise.resolve({ jobId: VALID_JOB_ID }),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "AI bridge unreachable." });
  });
});
