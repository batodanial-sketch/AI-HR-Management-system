import "server-only";

import { serverClient, adminClient } from "@/lib/supabase/server";
import type { RunStatus, StepLedgerEntry } from "./machine";
import type { WorkflowStepDefinition } from "./steps";

/**
 * Phase F workflow store seam.
 *
 * `supabaseWorkflowStore()` is the ONLY store production routes use: the
 * caller's session client (RLS enforced) with explicit organization_id
 * scoping on every query (defense in depth). Tables missing from the
 * generated `Database` types (`workflow_approvals`, `workflow_versions`,
 * new `workflow_runs` columns) are accessed through the established
 * `as never` precedent (same as `lib/knowledge/store.ts`).
 *
 * `memoryWorkflowStore()` is TEST-ONLY: identical interface, process-local
 * maps, zero I/O. It is never imported by a production route (grep-verified
 * in review) — demo/preview environments get an honest "unavailable" from
 * the engine, never simulated execution.
 */

export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerEvent: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  workflowId: string;
  version: number;
  graph: { steps: WorkflowStepDefinition[] };
  publishedBy: string | null;
  createdAt: string;
}

export interface WorkflowRun {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersion: number | null;
  status: string;
  currentStep: string | null;
  attempts: number;
  nextRetryAt: string | null;
  errorCode: string | null;
  triggerPayload: Record<string, unknown>;
  ledger: StepLedgerEntry[];
  initiatedBy: string | null;
  createdAt: string;
}

export interface WorkflowApproval {
  id: string;
  organizationId: string;
  runId: string;
  stepKey: string;
  approverUserId: string | null;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ApprovalRequest {
  title: string;
  reason: string;
  approverMinRole: "HR_ADMIN" | "MANAGER";
  context: Record<string, unknown>;
}

export interface WorkflowStore {
  getWorkflow(organizationId: string, workflowId: string): Promise<WorkflowDefinition | null>;
  listWorkflows(organizationId: string, options?: { status?: string; limit?: number; offset?: number }): Promise<{ rows: WorkflowDefinition[]; total: number }>;
  createWorkflow(
    organizationId: string,
    input: { name: string; description?: string | null; triggerType: string; triggerEvent?: string | null; status: string },
    createdBy: string | null,
  ): Promise<WorkflowDefinition>;
  updateWorkflowStatus(organizationId: string, workflowId: string, status: string): Promise<WorkflowDefinition | null>;
  deleteWorkflow(organizationId: string, workflowId: string): Promise<boolean>;
  saveVersion(organizationId: string, workflowId: string, graph: { steps: WorkflowStepDefinition[] }, publishedBy: string | null): Promise<WorkflowVersion>;
  getVersion(organizationId: string, workflowId: string, version: number): Promise<WorkflowVersion | null>;
  getLatestVersion(organizationId: string, workflowId: string): Promise<WorkflowVersion | null>;
  createRun(input: {
    organizationId: string;
    workflowId: string;
    workflowVersion: number | null;
    idempotencyKey: string;
    triggerPayload: Record<string, unknown>;
    initiatedBy: string | null;
  }): Promise<{ run: WorkflowRun; created: boolean }>;
  getRun(organizationId: string, runId: string): Promise<WorkflowRun | null>;
  listRuns(organizationId: string, options?: { status?: string; workflowId?: string; limit?: number; offset?: number }): Promise<{ rows: WorkflowRun[]; total: number }>;
  /**
   * Atomic guarded write: appends one ledger entry AND moves
   * (status, current_step, attempts, …) in a single UPDATE whose WHERE pins
   * the expected (status, current_step). Returns the updated run, or null
   * when another driver won the race (caller must stop and re-read).
   */
  guardedAdvance(
    organizationId: string,
    runId: string,
    expected: { status: string[]; currentStep: string | null },
    entry: StepLedgerEntry,
    patch: { status: RunStatus; currentStep: string | null; attempts?: number; nextRetryAt?: string | null; errorCode?: string | null },
    priorLedger: StepLedgerEntry[],
  ): Promise<WorkflowRun | null>;
  createApproval(organizationId: string, runId: string, stepKey: string, request: ApprovalRequest): Promise<WorkflowApproval>;
  findPendingApproval(organizationId: string, runId: string, stepKey: string): Promise<WorkflowApproval | null>;
  getApproval(organizationId: string, approvalId: string): Promise<WorkflowApproval | null>;
  decideApproval(
    organizationId: string,
    approvalId: string,
    decision: { status: "approved" | "rejected"; approverUserId: string },
  ): Promise<WorkflowApproval | null>;
  listApprovals(organizationId: string, options?: { status?: string; runId?: string; limit?: number; offset?: number }): Promise<{ rows: WorkflowApproval[]; total: number }>;
  /** Boolean membership oracle: returns the subset of userIds in the org. No rows leak. */
  verifyMembers(organizationId: string, userIds: string[]): Promise<string[]>;
}

/* ── row mapping (snake → camel at the boundary) ─────────────────────── */

function toDefinition(row: Record<string, unknown>): WorkflowDefinition {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    triggerType: String(row.trigger_type ?? row.trigger_event ?? "manual"),
    triggerEvent: (row.trigger_event as string | null) ?? null,
    status: String(row.status),
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toRun(row: Record<string, unknown>): WorkflowRun {
  const ledger = Array.isArray(row.executed_actions) ? (row.executed_actions as StepLedgerEntry[]) : [];
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workflowId: String(row.workflow_id),
    workflowVersion: typeof row.workflow_version === "number" ? row.workflow_version : null,
    status: String(row.status),
    currentStep: (row.current_step as string | null) ?? null,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    nextRetryAt: (row.next_retry_at as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    triggerPayload: (row.trigger_payload as Record<string, unknown>) ?? {},
    ledger,
    initiatedBy: (row.initiated_by as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function toApproval(row: Record<string, unknown>): WorkflowApproval {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    runId: String(row.workflow_run_id),
    stepKey: String(row.step_key),
    approverUserId: (row.approver_user_id as string | null) ?? null,
    status: String(row.status),
    decisionNote: (row.decision_note as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function toVersion(workflowId: string, row: Record<string, unknown>): WorkflowVersion {
  const graph = (row.graph as { steps?: WorkflowStepDefinition[] }) ?? {};
  return {
    workflowId,
    version: Number(row.version),
    graph: { steps: Array.isArray(graph.steps) ? graph.steps : [] },
    publishedBy: (row.published_by as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/* ── Supabase stores ───────────────────────────────────────────────────
 *
 * `supabaseWorkflowStore()` — user-session store for request-context routes
 * (RLS enforced, explicit org scoping). `serviceWorkflowStore(pin)` —
 * service-role store for sessionless system drives (webhook-triggered runs):
 * RLS is bypassed by the service role, so tenancy rests on the constructor
 * pin (every method asserts it) plus the per-query org scoping. The pin
 * makes cross-tenant use a loud throw instead of a silent leak.
 */

type SessionDb = ReturnType<typeof serverClient>;

function baseStore(db: () => SessionDb): WorkflowStore {
  return {
    async getWorkflow(organizationId, workflowId) {
      const { data, error } = await db().from("workflows").select("*").eq("organization_id", organizationId).eq("id", workflowId).maybeSingle();
      if (error || !data) return null;
      return toDefinition(data as unknown as Record<string, unknown>);
    },
    async listWorkflows(organizationId, options = {}) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 25));
      const offset = Math.max(0, options.offset ?? 0);
      let query = db().from("workflows").select("*", { count: "exact" }).eq("organization_id", organizationId).order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (options.status) query = query.eq("status", options.status);
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { rows: (data as unknown as Record<string, unknown>[]).map(toDefinition), total: count ?? 0 };
    },
    async createWorkflow(organizationId, input, createdBy) {
      const { data, error } = await db()
        .from("workflows")
        .insert({
          organization_id: organizationId,
          name: input.name,
          description: input.description ?? null,
          trigger_type: input.triggerType,
          trigger_event: input.triggerEvent ?? null,
          trigger_config: {},
          actions: [],
          status: input.status,
          created_by: createdBy,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Workflow creation failed.");
      return toDefinition(data as unknown as Record<string, unknown>);
    },
    async updateWorkflowStatus(organizationId, workflowId, status) {
      const { data, error } = await db()
        .from("workflows")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", workflowId)
        .select("*")
        .maybeSingle();
      if (error || !data) return null;
      return toDefinition(data as unknown as Record<string, unknown>);
    },
    async deleteWorkflow(organizationId, workflowId) {
      const { error, count } = await db().from("workflows").delete({ count: "exact" }).eq("organization_id", organizationId).eq("id", workflowId);
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
    async saveVersion(organizationId, workflowId, graph, publishedBy) {
      const existing = await db()
        .from("workflow_versions" as never)
        .select("version")
        .eq("organization_id", organizationId)
        .eq("workflow_id", workflowId)
        .order("version", { ascending: false })
        .limit(1);
      const rows = (existing.data as unknown as { version: number }[] | null) ?? [];
      const version = (rows[0]?.version ?? 0) + 1;
      const { data, error } = await db()
        .from("workflow_versions" as never)
        .insert({ organization_id: organizationId, workflow_id: workflowId, version, graph, published_by: publishedBy } as never)
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Version save failed.");
      return toVersion(workflowId, data as unknown as Record<string, unknown>);
    },
    async getVersion(organizationId, workflowId, version) {
      const { data, error } = await db()
        .from("workflow_versions" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("workflow_id", workflowId)
        .eq("version", version)
        .maybeSingle();
      if (error || !data) return null;
      return toVersion(workflowId, data as unknown as Record<string, unknown>);
    },
    async getLatestVersion(organizationId, workflowId) {
      const { data, error } = await db()
        .from("workflow_versions" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("workflow_id", workflowId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return toVersion(workflowId, data as unknown as Record<string, unknown>);
    },
    async createRun(input) {
      const payload = {
        organization_id: input.organizationId,
        workflow_id: input.workflowId,
        workflow_version: input.workflowVersion,
        idempotency_key: input.idempotencyKey,
        status: "queued",
        current_step: null,
        attempts: 0,
        next_retry_at: null,
        error_code: null,
        trigger_payload: input.triggerPayload,
        executed_actions: [],
        initiated_by: input.initiatedBy,
      } as never;
      const inserted = await db().from("workflow_runs").insert(payload).select("*").maybeSingle();
      if (!inserted.error && inserted.data) {
        return { run: toRun(inserted.data as unknown as Record<string, unknown>), created: true };
      }
      // Unique violation (or RLS-swallowed race): collapse onto the existing row.
      const existing = await db()
        .from("workflow_runs")
        .select("*")
        .eq("organization_id", input.organizationId)
        .eq("idempotency_key" as never, input.idempotencyKey)
        .maybeSingle();
      if (existing.error || !existing.data) {
        throw new Error(inserted.error?.message ?? "Run creation failed.");
      }
      return { run: toRun(existing.data as unknown as Record<string, unknown>), created: false };
    },
    async getRun(organizationId, runId) {
      const { data, error } = await db().from("workflow_runs").select("*").eq("organization_id", organizationId).eq("id", runId).maybeSingle();
      if (error || !data) return null;
      return toRun(data as unknown as Record<string, unknown>);
    },
    async listRuns(organizationId, options = {}) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 25));
      const offset = Math.max(0, options.offset ?? 0);
      let query = db().from("workflow_runs").select("*", { count: "exact" }).eq("organization_id", organizationId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (options.status) query = query.eq("status", options.status);
      if (options.workflowId) query = query.eq("workflow_id", options.workflowId);
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { rows: (data as unknown as Record<string, unknown>[]).map(toRun), total: count ?? 0 };
    },
    async guardedAdvance(organizationId, runId, expected, entry, patch, priorLedger) {
      const nextLedger = [...priorLedger, entry];
      let query = db()
        .from("workflow_runs")
        .update({
          executed_actions: nextLedger,
          status: patch.status,
          current_step: patch.currentStep,
          attempts: patch.attempts ?? undefined,
          next_retry_at: patch.nextRetryAt ?? null,
          error_code: patch.errorCode ?? null,
        } as never)
        .eq("organization_id", organizationId)
        .eq("id", runId)
        .in("status", expected.status);
      query = expected.currentStep === null ? query.is("current_step", null) : query.eq("current_step" as never, expected.currentStep);
      const { data, error } = await query.select("*").maybeSingle();
      if (error || !data) return null;
      return toRun(data as unknown as Record<string, unknown>);
    },
    async createApproval(organizationId, runId, stepKey, request) {
      const { data, error } = await db()
        .from("workflow_approvals" as never)
        .insert({
          organization_id: organizationId,
          workflow_run_id: runId,
          step_key: stepKey,
          approver_user_id: null,
          status: "pending",
          decision_note: JSON.stringify({ title: request.title, reason: request.reason, approverMinRole: request.approverMinRole, context: request.context }),
        } as never)
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Approval creation failed.");
      return toApproval(data as unknown as Record<string, unknown>);
    },
    async findPendingApproval(organizationId, runId, stepKey) {
      const { data, error } = await db()
        .from("workflow_approvals" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("workflow_run_id", runId)
        .eq("step_key", stepKey)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return toApproval(data as unknown as Record<string, unknown>);
    },
    async getApproval(organizationId, approvalId) {
      const { data, error } = await db().from("workflow_approvals" as never).select("*").eq("organization_id", organizationId).eq("id", approvalId).maybeSingle();
      if (error || !data) return null;
      return toApproval(data as unknown as Record<string, unknown>);
    },
    async decideApproval(organizationId, approvalId, decision) {
      const { data, error } = await db()
        .from("workflow_approvals" as never)
        .update({ status: decision.status, approver_user_id: decision.approverUserId, decided_at: new Date().toISOString() } as never)
        .eq("organization_id", organizationId)
        .eq("id", approvalId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (error || !data) return null;
      return toApproval(data as unknown as Record<string, unknown>);
    },
    async listApprovals(organizationId, options = {}) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 25));
      const offset = Math.max(0, options.offset ?? 0);
      let query = db().from("workflow_approvals" as never).select("*", { count: "exact" }).eq("organization_id", organizationId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (options.status) query = query.eq("status", options.status);
      if (options.runId) query = query.eq("workflow_run_id", options.runId);
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { rows: (data as unknown as Record<string, unknown>[]).map(toApproval), total: count ?? 0 };
    },
    async verifyMembers(organizationId, userIds) {
      if (userIds.length === 0) return [];
      // Service-role boolean oracle (session RLS can only see the caller's own
      // row). Returns the verified id subset — never membership rows.
      const { data, error } = await adminClient().from("memberships").select("user_id").eq("organization_id", organizationId).in("user_id", [...new Set(userIds)]);
      if (error || !data) return [];
      return (data as unknown as { user_id: string }[]).map((row) => row.user_id);
    },
  };
}

export function supabaseWorkflowStore(): WorkflowStore {
  return baseStore(() => serverClient());
}

export function serviceWorkflowStore(pinnedOrganizationId: string): WorkflowStore {
  const inner = baseStore(() => adminClient() as unknown as SessionDb);
  const guard = (organizationId: string): void => {
    if (organizationId !== pinnedOrganizationId) {
      throw new Error("Workflow store: organization pin mismatch.");
    }
  };
  return {
    getWorkflow: (org, id) => { guard(org); return inner.getWorkflow(org, id); },
    listWorkflows: (org, options) => { guard(org); return inner.listWorkflows(org, options); },
    createWorkflow: (org, input, createdBy) => { guard(org); return inner.createWorkflow(org, input, createdBy); },
    updateWorkflowStatus: (org, id, status) => { guard(org); return inner.updateWorkflowStatus(org, id, status); },
    deleteWorkflow: (org, id) => { guard(org); return inner.deleteWorkflow(org, id); },
    saveVersion: (org, workflowId, graph, publishedBy) => { guard(org); return inner.saveVersion(org, workflowId, graph, publishedBy); },
    getVersion: (org, workflowId, version) => { guard(org); return inner.getVersion(org, workflowId, version); },
    getLatestVersion: (org, workflowId) => { guard(org); return inner.getLatestVersion(org, workflowId); },
    createRun: (input) => { guard(input.organizationId); return inner.createRun(input); },
    getRun: (org, runId) => { guard(org); return inner.getRun(org, runId); },
    listRuns: (org, options) => { guard(org); return inner.listRuns(org, options); },
    guardedAdvance: (org, runId, expected, entry, patch, priorLedger) => { guard(org); return inner.guardedAdvance(org, runId, expected, entry, patch, priorLedger); },
    createApproval: (org, runId, stepKey, request) => { guard(org); return inner.createApproval(org, runId, stepKey, request); },
    findPendingApproval: (org, runId, stepKey) => { guard(org); return inner.findPendingApproval(org, runId, stepKey); },
    getApproval: (org, approvalId) => { guard(org); return inner.getApproval(org, approvalId); },
    decideApproval: (org, approvalId, decision) => { guard(org); return inner.decideApproval(org, approvalId, decision); },
    listApprovals: (org, options) => { guard(org); return inner.listApprovals(org, options); },
    verifyMembers: (org, userIds) => { guard(org); return inner.verifyMembers(org, userIds); },
  };
}

/* ── Memory store (TEST-ONLY — never imported by production routes) ────── */

export interface MemoryWorkflowStore extends WorkflowStore {
  /** Test-only membership seeding for the verifyMembers oracle. */
  __seedMembers(userIds: string[]): void;
}

export function memoryWorkflowStore(): MemoryWorkflowStore {
  const workflows = new Map<string, WorkflowDefinition>();
  const versions = new Map<string, WorkflowVersion[]>();
  const runs = new Map<string, WorkflowRun>();
  const runsByKey = new Map<string, string>();
  const approvals = new Map<string, WorkflowApproval>();
  const members = new Set<string>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;
  // Snapshot reads: Supabase returns fresh objects per query, never live
  // references — the memory store clones so contention behaves identically.
  const snap = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  const scopedRuns = (organizationId: string) => [...runs.values()].filter((r) => r.organizationId === organizationId);
  const scopedApprovals = (organizationId: string) => [...approvals.values()].filter((a) => a.organizationId === organizationId);

  return {
    async getWorkflow(organizationId, workflowId) {
      const row = workflows.get(workflowId);
      return row && row.organizationId === organizationId ? snap(row) : null;
    },
    async listWorkflows(organizationId, options = {}) {
      const rows = [...workflows.values()]
        .filter((w) => w.organizationId === organizationId && (!options.status || w.status === options.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 25;
      return { rows: snap(rows.slice(offset, offset + limit)), total: rows.length };
    },
    async createWorkflow(organizationId, input, createdBy) {
      const now = new Date().toISOString();
      const row: WorkflowDefinition = {
        id: id("wf"),
        organizationId,
        name: input.name,
        description: input.description ?? null,
        triggerType: input.triggerType,
        triggerEvent: input.triggerEvent ?? null,
        status: input.status,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      workflows.set(row.id, row);
      return snap(row);
    },
    async updateWorkflowStatus(organizationId, workflowId, status) {
      const row = workflows.get(workflowId);
      if (!row || row.organizationId !== organizationId) return null;
      row.status = status;
      row.updatedAt = new Date().toISOString();
      return snap(row);
    },
    async deleteWorkflow(organizationId, workflowId) {
      const row = workflows.get(workflowId);
      if (!row || row.organizationId !== organizationId) return false;
      workflows.delete(workflowId);
      versions.delete(workflowId);
      return true;
    },
    async saveVersion(organizationId, workflowId, graph, publishedBy) {
      const list = versions.get(workflowId) ?? [];
      const version: WorkflowVersion = {
        workflowId,
        version: list.length + 1,
        graph,
        publishedBy,
        createdAt: new Date().toISOString(),
      };
      void organizationId;
      list.push(version);
      versions.set(workflowId, list);
      return snap(version);
    },
    async getVersion(organizationId, workflowId, version) {
      void organizationId;
      const found = (versions.get(workflowId) ?? []).find((v) => v.version === version) ?? null;
      return found ? snap(found) : null;
    },
    async getLatestVersion(organizationId, workflowId) {
      void organizationId;
      const list = versions.get(workflowId) ?? [];
      return list.length > 0 ? snap(list[list.length - 1]) : null;
    },
    async createRun(input) {
      const key = `${input.organizationId}:${input.idempotencyKey}`;
      const existingId = runsByKey.get(key);
      if (existingId) {
        const existing = runs.get(existingId);
        if (existing) return { run: snap(existing), created: false };
      }
      const run: WorkflowRun = {
        id: id("run"),
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        workflowVersion: input.workflowVersion,
        status: "queued",
        currentStep: null,
        attempts: 0,
        nextRetryAt: null,
        errorCode: null,
        triggerPayload: input.triggerPayload,
        ledger: [],
        initiatedBy: input.initiatedBy,
        createdAt: new Date().toISOString(),
      };
      runs.set(run.id, run);
      runsByKey.set(key, run.id);
      return { run: snap(run), created: true };
    },
    async getRun(organizationId, runId) {
      const row = runs.get(runId);
      return row && row.organizationId === organizationId ? snap(row) : null;
    },
    async listRuns(organizationId, options = {}) {
      const rows = scopedRuns(organizationId)
        .filter((r) => (!options.status || r.status === options.status) && (!options.workflowId || r.workflowId === options.workflowId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 25;
      return { rows: snap(rows.slice(offset, offset + limit)), total: rows.length };
    },
    async guardedAdvance(organizationId, runId, expected, entry, patch, priorLedger) {
      const row = runs.get(runId);
      if (!row || row.organizationId !== organizationId) return null;
      if (!expected.status.includes(row.status) || row.currentStep !== expected.currentStep) return null;
      // Simulate lost-update protection: the stored ledger must still equal
      // what the driver read (Supabase achieves this via the pinned WHERE).
      if (row.ledger.length !== priorLedger.length) return null;
      row.ledger = [...priorLedger, entry];
      row.status = patch.status;
      row.currentStep = patch.currentStep;
      if (patch.attempts !== undefined) row.attempts = patch.attempts;
      row.nextRetryAt = patch.nextRetryAt ?? null;
      row.errorCode = patch.errorCode ?? null;
      return snap(row);
    },
    async createApproval(organizationId, runId, stepKey, request) {
      const row: WorkflowApproval = {
        id: id("appr"),
        organizationId,
        runId,
        stepKey,
        approverUserId: null,
        status: "pending",
        decisionNote: JSON.stringify({ title: request.title, reason: request.reason, approverMinRole: request.approverMinRole, context: request.context }),
        decidedAt: null,
        createdAt: new Date().toISOString(),
      };
      approvals.set(row.id, row);
      return snap(row);
    },
    async findPendingApproval(organizationId, runId, stepKey) {
      const hit = scopedApprovals(organizationId).find((a) => a.runId === runId && a.stepKey === stepKey && a.status === "pending") ?? null;
      return hit ? snap(hit) : null;
    },
    async getApproval(organizationId, approvalId) {
      const row = approvals.get(approvalId);
      return row && row.organizationId === organizationId ? snap(row) : null;
    },
    async decideApproval(organizationId, approvalId, decision) {
      const row = approvals.get(approvalId);
      if (!row || row.organizationId !== organizationId || row.status !== "pending") return null;
      row.status = decision.status;
      row.approverUserId = decision.approverUserId;
      row.decidedAt = new Date().toISOString();
      return snap(row);
    },
    async listApprovals(organizationId, options = {}) {
      const rows = scopedApprovals(organizationId)
        .filter((a) => (!options.status || a.status === options.status) && (!options.runId || a.runId === options.runId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 25;
      return { rows: snap(rows.slice(offset, offset + limit)), total: rows.length };
    },
    async verifyMembers(organizationId, userIds) {
      void organizationId;
      return [...new Set(userIds)].filter((userId) => members.has(userId));
    },
    __seedMembers(userIds: string[]) {
      members.clear();
      for (const userId of userIds) members.add(userId);
    },
  };
}
