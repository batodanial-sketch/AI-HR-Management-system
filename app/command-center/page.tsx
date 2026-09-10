import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, KanbanSquare, ShieldAlert, ShieldCheck, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCandidates } from "@/lib/api";
import { getInsightSet } from "@/lib/intelligence/aggregator";
import { composeBriefing, type HrBriefing } from "@/lib/intelligence/briefing";
import { requireIntelligenceRole } from "@/lib/intelligence/handler";
import type { Insight, InsightSeverity } from "@/lib/intelligence/types";
import { getRbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";
import { supabaseWorkflowStore } from "@/lib/workflows/store";

export const metadata: Metadata = {
  title: "Command Center",
};

export const dynamic = "force-dynamic";

const SEVERITY_BADGE: Record<InsightSeverity, "destructive" | "secondary" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
};

/**
 * Command Center — the HR morning-briefing surface.
 *
 * Server-rendered from the same deterministic sources as the APIs: the HR
 * briefing (HR_ADMIN+, via `requireIntelligenceRole`) and the recruitment
 * pipeline snapshot. Sections the caller may not see degrade to an honest
 * "unavailable for your role" note — never a silent empty state, never a
 * 500, and never data the caller is not authorized for.
 */
export default async function CommandCenterPage() {
  const gate = await requireIntelligenceRole();
  let briefing: HrBriefing | null = null;
  if (!(gate instanceof Response)) {
    try {
      const set = await getInsightSet();
      briefing = composeBriefing(set.insights, set.generatedAt);
    } catch {
      briefing = null;
    }
  }

  let stageCounts: { stage: string; count: number }[] | null = null;
  try {
    const candidates = await getCandidates();
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      counts.set(candidate.stage, (counts.get(candidate.stage) ?? 0) + 1);
    }
    stageCounts = [...counts.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    stageCounts = null;
  }

  // Workflows snapshot: runs for members, pending-approval count for MANAGER+.
  let workflowSnapshot: {
    pendingApprovals: number | null;
    activeRuns: number;
    failedRuns: number;
    recent: { id: string; status: string; workflowName: string | null }[];
  } | null = null;
  try {
    const ctx = await getRbacContext();
    const store = supabaseWorkflowStore();
    const [pending, active, failed, recent] = await Promise.all([
      roleAtLeast(ctx.role, "MANAGER") ? store.listApprovals(ctx.organizationId, { status: "pending", limit: 1 }) : Promise.resolve(null),
      store.listRuns(ctx.organizationId, { status: "running", limit: 1 }),
      store.listRuns(ctx.organizationId, { status: "failed", limit: 1 }),
      store.listRuns(ctx.organizationId, { limit: 5 }),
    ]);
    const names = new Map<string, string>();
    for (const run of recent.rows) {
      if (!names.has(run.workflowId)) {
        const workflow = await store.getWorkflow(ctx.organizationId, run.workflowId);
        if (workflow) names.set(run.workflowId, workflow.name);
      }
    }
    workflowSnapshot = {
      pendingApprovals: pending ? pending.total : null,
      activeRuns: active.total,
      failedRuns: failed.total,
      recent: recent.rows.map((run) => ({ id: run.id, status: run.status, workflowName: names.get(run.workflowId) ?? null })),
    };
  } catch {
    workflowSnapshot = null;
  }

  return (
    <div className="space-y-6" data-testid="command-center">
      <PageHeader
        title="Command Center"
        description="This morning's HR briefing, hiring pipeline, and fastest path to every action."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="command-center-briefing">
          <CardHeader>
            <CardTitle>Daily HR Briefing</CardTitle>
            <CardDescription>
              {briefing
                ? `Generated ${new Date(briefing.generatedAt).toLocaleString()} · ${briefing.counts.attention} need attention · ${briefing.counts.positive} positive signals`
                : "The briefing is only available to HR administrators."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!briefing && (
              <div className="flex items-start gap-3 rounded-lg border border-dashed p-4" data-testid="command-center-briefing-denied">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Your role cannot view the HR briefing. Ask an HR administrator for access — nothing is hidden
                  silently; this section only renders for authorized roles.
                </p>
              </div>
            )}
            {briefing && briefing.attention.length === 0 && briefing.positive.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="command-center-briefing-empty">
                All quiet — no attention items or signals in this briefing.
                {briefing.counts.insufficient > 0 &&
                  ` ${briefing.counts.insufficient} categor${briefing.counts.insufficient === 1 ? "y" : "ies"} reported insufficient data rather than guessing.`}
              </p>
            )}
            {briefing?.attention.map((insight) => <InsightRow key={insight.id} insight={insight} />)}
            {briefing && briefing.positive.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold">Positive signals</h3>
                {briefing.positive.map((insight) => <InsightRow key={insight.id} insight={insight} />)}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card data-testid="command-center-pipeline">
            <CardHeader>
              <CardTitle>Hiring pipeline</CardTitle>
              <CardDescription>
                <Link href="/recruitment" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Open recruitment <ArrowRight className="h-3 w-3" />
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stageCounts === null && (
                <p className="text-sm text-muted-foreground">Pipeline unavailable for your role.</p>
              )}
              {stageCounts !== null && stageCounts.length === 0 && (
                <p className="text-sm text-muted-foreground">No candidates in the pipeline yet.</p>
              )}
              {stageCounts !== null && stageCounts.length > 0 && (
                <ul className="space-y-2">
                  {stageCounts.map(({ stage, count }) => (
                    <li key={stage} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{stage}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card data-testid="command-center-actions">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <ActionLink href="/copilot" icon={<Bot className="h-4 w-4" />} label="Ask AI Copilot" />
              <ActionLink href="/recruitment" icon={<KanbanSquare className="h-4 w-4" />} label="Review candidates" />
              <ActionLink href="/employees" icon={<Users className="h-4 w-4" />} label="Employee directory" />
              <ActionLink href="/approvals" icon={<ShieldCheck className="h-4 w-4" />} label="Approval Center" />
              <ActionLink href="/workflows/builder" icon={<Workflow className="h-4 w-4" />} label="Build a workflow" />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card data-testid="command-center-workflows">
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <CardDescription>
            {workflowSnapshot === null
              ? "Workflow data is unavailable — sign in to load your organization's runs."
              : workflowSnapshot.pendingApprovals === null
                ? "Recent runs. Approval counts are visible to managers and HR administrators."
                : `${workflowSnapshot.pendingApprovals} request${workflowSnapshot.pendingApprovals === 1 ? "" : "s"} awaiting decision · ${workflowSnapshot.activeRuns} active · ${workflowSnapshot.failedRuns} failed.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workflowSnapshot === null && (
            <p className="text-sm text-muted-foreground">Sign in to see workflow activity.</p>
          )}
          {workflowSnapshot !== null && (
            <div className="flex flex-wrap items-center gap-2">
              {workflowSnapshot.pendingApprovals !== null && (
                <Link href="/approvals">
                  <Badge variant={workflowSnapshot.pendingApprovals > 0 ? "secondary" : "outline"} className="cursor-pointer">
                    {workflowSnapshot.pendingApprovals} pending approval{workflowSnapshot.pendingApprovals === 1 ? "" : "s"}
                  </Badge>
                </Link>
              )}
              <Badge variant="outline">{workflowSnapshot.activeRuns} active runs</Badge>
              <Badge variant={workflowSnapshot.failedRuns > 0 ? "destructive" : "outline"}>{workflowSnapshot.failedRuns} failed</Badge>
            </div>
          )}
          {workflowSnapshot !== null && workflowSnapshot.recent.length > 0 && (
            <ul className="mt-4 space-y-2">
              {workflowSnapshot.recent.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/workflows/runs/${run.id}`} className="text-primary hover:underline">
                    {run.workflowName ?? "Workflow"} <span className="font-mono text-xs text-muted-foreground">{run.id.slice(0, 8)}</span>
                  </Link>
                  <Badge variant="outline">{run.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  return (
    <div className="rounded-lg border p-3" data-testid={`command-center-insight-${insight.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{insight.title}</p>
        <Badge variant={SEVERITY_BADGE[insight.severity]}>{insight.severity}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {insight.scope.label} · confidence {Math.round(insight.confidence * 100)}% · {insight.evidence.length} evidence
        point{insight.evidence.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function ActionLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
    >
      {icon}
      {label}
    </Link>
  );
}
