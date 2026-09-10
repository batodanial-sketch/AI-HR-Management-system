import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RunActions } from "@/components/workflows/run-actions";
import { getRbacContext } from "@/lib/rbac";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { canManageRun } from "@/lib/workflows/handler";
import { parseApprovalRequest } from "@/lib/workflows/handler";

export const metadata: Metadata = {
  title: "Workflow Run",
};

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  succeeded: "default",
  failed: "destructive",
  cancelled: "outline",
  waiting_approval: "secondary",
  running: "secondary",
  queued: "secondary",
};

/**
 * Run detail — any member of the org may view (mirrors the API). The
 * ledger timeline renders every recorded step visit; failures show the
 * classified error code, never a raw trace.
 */
export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  let actor: { userId: string; organizationId: string; role: import("@/lib/rbac").RbacContext["role"] } | null = null;
  try {
    const ctx = await getRbacContext();
    actor = { userId: ctx.user.id, organizationId: ctx.organizationId, role: ctx.role };
  } catch {
    actor = null;
  }
  if (!actor) {
    return (
      <div className="space-y-6" data-testid="run-detail">
        <PageHeader title="Workflow Run" description="Run timeline and approvals." />
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-4" data-testid="run-detail-denied">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sign in to view this run.</p>
        </div>
      </div>
    );
  }

  const store = supabaseWorkflowStore();
  const run = await store.getRun(actor.organizationId, runId);
  if (!run) notFound();
  const workflow = await store.getWorkflow(actor.organizationId, run.workflowId);
  const approvals = await store.listApprovals(actor.organizationId, { runId, limit: 50 });
  const manageable = canManageRun({ userId: actor.userId, organizationId: actor.organizationId, role: actor.role, demoMode: false }, run.initiatedBy);

  return (
    <div className="space-y-6" data-testid="run-detail">
      <PageHeader
        title={workflow?.name ?? "Workflow Run"}
        description={`Run ${run.id.slice(0, 8)} · version ${run.workflowVersion ?? "—"} · started ${new Date(run.createdAt).toLocaleString()}`}
        actions={<Badge variant={STATUS_VARIANT[run.status] ?? "outline"} data-testid="run-status">{run.status}</Badge>}
      />

      {manageable && <RunActions runId={run.id} status={run.status} />}

      {run.errorCode && (
        <Card data-testid="run-error">
          <CardHeader><CardTitle className="text-base">Failure</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{run.errorCode}</p>
            {run.nextRetryAt && <p className="text-sm text-muted-foreground">Next retry eligible after {new Date(run.nextRetryAt).toLocaleString()}.</p>}
          </CardContent>
        </Card>
      )}

      <Card data-testid="run-timeline">
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <CardDescription>{run.ledger.length} recorded step visit{run.ledger.length === 1 ? "" : "s"} · {run.attempts} attempt{run.attempts === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {run.ledger.length === 0 && <p className="text-sm text-muted-foreground">No steps recorded yet.</p>}
          <ol className="space-y-2">
            {run.ledger.map((entry, index) => (
              <li key={index} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm" data-testid={`run-ledger-${index}`}>
                <div>
                  <span className="font-mono">{entry.stepKey}</span>
                  <span className="text-muted-foreground"> · {entry.stepType} · attempt {entry.attempt}</span>
                  {entry.detail && <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail.slice(0, 280)}</p>}
                  {entry.errorCode && <p className="mt-0.5 font-mono text-xs text-destructive">{entry.errorCode}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={entry.outcome === "failed" ? "destructive" : entry.outcome === "waiting" ? "secondary" : "outline"}>{entry.outcome}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card data-testid="run-approvals">
        <CardHeader>
          <CardTitle className="text-base">Approvals</CardTitle>
          <CardDescription>
            <Link href="/approvals" className="text-primary hover:underline">Open Approval Center</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvals.rows.length === 0 && <p className="text-sm text-muted-foreground">No approval steps in this run.</p>}
          <ul className="space-y-2">
            {approvals.rows.map((approval) => {
              const request = parseApprovalRequest(approval.decisionNote);
              return (
                <li key={approval.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span>{request.title} <span className="text-muted-foreground">· {approval.stepKey}</span></span>
                  <Badge variant={approval.status === "pending" ? "secondary" : approval.status === "approved" ? "default" : "destructive"}>{approval.status}</Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
