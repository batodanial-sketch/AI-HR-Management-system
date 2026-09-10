"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ApprovalCardData {
  id: string;
  status: string;
  stepKey: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  request: {
    title: string;
    reason: string;
    approverMinRole: "HR_ADMIN" | "MANAGER";
    context: Record<string, unknown>;
  };
  workflowName: string | null;
  runId: string;
  /** Visibility hint only — the API re-enforces who may decide. */
  canDecide: boolean;
}

function ContextCard({ context }: { context: Record<string, unknown> }) {
  // Authored approval context: Why / Evidence / What-changes / Who-affected / Reversible.
  if (typeof context.why === "string" && context.why.length > 0) {
    const evidence = Array.isArray(context.evidence) ? context.evidence.filter((e): e is string => typeof e === "string") : [];
    const changes = Array.isArray(context.changes) ? context.changes.filter((c): c is string => typeof c === "string") : [];
    return (
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-semibold">Why</dt>
          <dd className="text-muted-foreground">{context.why}</dd>
        </div>
        {evidence.length > 0 && (
          <div>
            <dt className="font-semibold">Evidence</dt>
            <dd><ul className="list-disc pl-5 text-muted-foreground">{evidence.map((item, i) => <li key={i}>{item}</li>)}</ul></dd>
          </div>
        )}
        {changes.length > 0 && (
          <div>
            <dt className="font-semibold">What changes</dt>
            <dd><ul className="list-disc pl-5 text-muted-foreground">{changes.map((item, i) => <li key={i}>{item}</li>)}</ul></dd>
          </div>
        )}
        {typeof context.affected === "string" && context.affected.length > 0 && (
          <div>
            <dt className="font-semibold">Who is affected</dt>
            <dd className="text-muted-foreground">{context.affected}</dd>
          </div>
        )}
        <div>
          <dt className="font-semibold">Can it be undone</dt>
          <dd className="text-muted-foreground">{context.reversible === true ? "Yes — reversible." : "No — treat as irreversible."}</dd>
        </div>
      </dl>
    );
  }
  // Tool-call approval: frozen proposal arguments.
  if (typeof context.tool === "string") {
    return (
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-semibold">Tool</dt>
          <dd className="font-mono text-muted-foreground">{context.tool}</dd>
        </div>
        <div>
          <dt className="font-semibold">Frozen arguments</dt>
          <dd><pre className="overflow-x-auto rounded-md border bg-muted/50 p-2 text-xs">{JSON.stringify(context.args ?? {}, null, 2)}</pre></dd>
        </div>
        {typeof context.proposalId === "string" && (
          <div>
            <dt className="font-semibold">Proposal</dt>
            <dd className="font-mono text-xs text-muted-foreground">{context.proposalId}</dd>
          </div>
        )}
        <p className="text-muted-foreground">Approving executes the frozen arguments exactly as shown — they cannot be edited here.</p>
      </dl>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/50 p-2 text-xs" data-testid="approval-context-raw">
      {JSON.stringify(context, null, 2)}
    </pre>
  );
}

export function ApprovalCard({ approval }: { approval: ApprovalCardData }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"approve" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const decided = approval.status !== "pending";

  async function decide(action: "approve" | "deny") {
    if (action === "deny" && !window.confirm("Deny this request? The run will fail permanently.")) return;
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/workflows/approvals/${approval.id}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setError(payload.error ?? `Could not ${action} (HTTP ${response.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — the decision was not recorded. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card data-testid={`approval-card-${approval.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{approval.request.title}</CardTitle>
            <CardDescription>
              {approval.workflowName ?? "Workflow"} · step <span className="font-mono">{approval.stepKey}</span> ·{" "}
              <Link href={`/workflows/runs/${approval.runId}`} className="text-primary hover:underline">view run</Link>
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={approval.status === "pending" ? "secondary" : approval.status === "approved" ? "default" : "destructive"}>
              {approval.status}
            </Badge>
            <Badge variant="outline" title="Minimum role allowed to decide">{approval.request.approverMinRole}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{approval.request.reason}</p>
        <p className="text-xs text-muted-foreground">
          Requested {new Date(approval.createdAt).toLocaleString()}
          {approval.decidedAt && ` · decided ${new Date(approval.decidedAt).toLocaleString()}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ContextCard context={approval.request.context} />
        {decided && (
          <p className="text-sm text-muted-foreground" data-testid={`approval-decided-${approval.id}`}>
            Decided — {approval.status}{approval.decidedBy ? ` by ${approval.decidedBy}` : ""}. Decisions are final.
          </p>
        )}
        {!decided && !approval.canDecide && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`approval-cannot-decide-${approval.id}`}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Your role cannot decide this request (requires {approval.request.approverMinRole}). The decision buttons stay hidden — enforcement is server-side.
          </p>
        )}
        {!decided && approval.canDecide && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide("approve")} disabled={pending !== null} data-testid={`approval-approve-${approval.id}`}>
              <Check className="h-4 w-4" /> {pending === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => decide("deny")} disabled={pending !== null} data-testid={`approval-deny-${approval.id}`}>
              <X className="h-4 w-4" /> {pending === "deny" ? "Denying…" : "Deny"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
