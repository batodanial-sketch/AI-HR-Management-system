jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/rbac", () => ({ getRbacContext: jest.fn(), rbacErrorResponse: () => null }));

import { WorkflowDriveError } from "@/lib/workflows/executor";
import { canManageRun, mapDriveError, parseApprovalRequest } from "@/lib/workflows/handler";

describe("mapDriveError", () => {
  it.each([
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["VALIDATION", 400],
    ["NOT_DRIVABLE", 409],
    ["ALREADY_DECIDED", 409],
    ["CONTESTED", 409],
  ] as const)("maps %s to %d", async (code, status) => {
    const res = mapDriveError(new WorkflowDriveError(code, "boom"));
    expect(res.status).toBe(status);
    expect(((await res.json()) as { code: string }).code).toBe(code);
  });

  it("maps NOT_DUE to 429 with Retry-After", async () => {
    const res = mapDriveError(new WorkflowDriveError("NOT_DUE", "wait", 90_000));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    expect(((await res.json()) as { retryAfterMs: number }).retryAfterMs).toBe(90_000);
  });

  it("maps engine-unavailable to 503 and unknowns to 500", async () => {
    expect(mapDriveError(new Error("Workflow engine unavailable: x")).status).toBe(503);
    expect(mapDriveError(new Error("kaboom")).status).toBe(500);
  });
});

describe("canManageRun", () => {
  const admin = { userId: "u", organizationId: "o", role: "HR_ADMIN", demoMode: false } as never;
  const me = { userId: "me", organizationId: "o", role: "EMPLOYEE", demoMode: false } as never;
  it("initiator or HR_ADMIN+; never strangers; system runs need privilege", () => {
    expect(canManageRun(me, "me")).toBe(true);
    expect(canManageRun(me, "other")).toBe(false);
    expect(canManageRun(me, null)).toBe(false);
    expect(canManageRun(admin, "other")).toBe(true);
    expect(canManageRun(admin, null)).toBe(true);
  });
});

describe("parseApprovalRequest", () => {
  it("parses the envelope and falls back defensively", () => {
    expect(parseApprovalRequest(null).approverMinRole).toBe("HR_ADMIN");
    expect(parseApprovalRequest("not-json").reason).toBe("(no reason recorded)");
    const parsed = parseApprovalRequest(JSON.stringify({ title: "T", reason: "R", approverMinRole: "MANAGER", context: { why: "x" } }));
    expect(parsed).toEqual({ title: "T", reason: "R", approverMinRole: "MANAGER", context: { why: "x" } });
    // Unknown tiers collapse to the strict default, never the lax one.
    expect(parseApprovalRequest(JSON.stringify({ approverMinRole: "EMPLOYEE" })).approverMinRole).toBe("HR_ADMIN");
  });
});
