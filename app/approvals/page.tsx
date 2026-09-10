import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ApprovalCard } from "@/components/workflows/approval-card";
import { getRbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { canDecideApproval } from "@/lib/workflows/executor";
import { parseApprovalRequest } from "@/lib/workflows/handler";

export const metadata: Metadata = {
  title: "Approval Center",
};

export const dynamic = "force-dynamic";

/**
 * Approval Center — the ONLY place workflow approvals are decided.
 * MANAGER+ to view (mirrors the API); each card's decision buttons render
 * only when the caller holds the step's minimum tier. Enforcement stays
 * server-side in the API + executor — the UI only hides what would 403.
 */
export default async function ApprovalsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const query = (await searchParams) ?? {};
  const status = query.status === "approved" || query.status === "rejected" || query.status === "expired" ? query.status : "pending";

  let actor: { userId: string; organizationId: string; role: import("@/lib/rbac").RbacContext["role"] } | null = null;
  try {
    const ctx = await getRbacContext();
    if (roleAtLeast(ctx.role, "MANAGER")) {
      actor = { userId: ctx.user.id, organizationId: ctx.organizationId, role: ctx.role };
    }
  } catch {
    actor = null;
  }

  if (!actor) {
    return (
      <div className="space-y-6" data-testid="approvals">
        <PageHeader title="Approval Center" description="Human decisions for workflow runs." />
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-4" data-testid="approvals-denied">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The Approval Center is available to managers and HR administrators. Sign in with an authorized role —
            nothing is hidden silently; this page only renders for approvers.
          </p>
        </div>
      </div>
    );
  }

  const store = supabaseWorkflowStore();
  const { rows, total } = await store.listApprovals(actor.organizationId, { status, limit: 25 });
  const cards = await Promise.all(
    rows.map(async (approval) => {
      const run = await store.getRun(actor!.organizationId, approval.runId);
      const workflow = run ? await store.getWorkflow(actor!.organizationId, run.workflowId) : null;
      const request = parseApprovalRequest(approval.decisionNote);
      return {
        id: approval.id,
        status: approval.status,
        stepKey: approval.stepKey,
        createdAt: approval.createdAt,
        decidedAt: approval.decidedAt,
        decidedBy: approval.approverUserId,
        request,
        workflowName: workflow?.name ?? null,
        runId: approval.runId,
        canDecide: canDecideApproval({ approverUserId: actor!.userId, approverRole: actor!.role, minRole: request.approverMinRole, requesterUserId: run?.initiatedBy ?? null }),
      };
    }),
  );

  return (
    <div className="space-y-6" data-testid="approvals">
      <PageHeader
        title="Approval Center"
        description={`${total} ${status} request${total === 1 ? "" : "s"}. Every decision is final, attributed, and audited.`}
      />
      <div className="flex gap-2" data-testid="approvals-filter">
        {(["pending", "approved", "rejected", "expired"] as const).map((tab) => (
          <Link key={tab} href={tab === "pending" ? "/approvals" : `/approvals?status=${tab}`}>
            <Badge variant={status === tab ? "default" : "outline"} className="cursor-pointer capitalize">{tab}</Badge>
          </Link>
        ))}
      </div>
      {cards.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="approvals-empty">
          {status === "pending" ? "All clear — no requests awaiting decision." : `No ${status} requests.`}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((approval) => <ApprovalCard key={approval.id} approval={approval} />)}
      </div>
    </div>
  );
}
