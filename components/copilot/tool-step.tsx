"use client";

import {
  Ban,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Rich tool-execution UI for the agentic Copilot.
 *
 * `ToolStepCard` renders each planner-emitted tool call as an inline card:
 *  - write tools awaiting consent render an approval card (Approve / Deny)
 *  - executions show a spinner → success/error status badge
 *  - state-modifying results render a compact `ToolResultCard` with live
 *    status badges derived from the CRUD route's response row
 */

export type ToolStepStatus = "pending" | "executing" | "ok" | "error" | "denied";

export interface ToolStepState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolStepStatus;
  message?: string;
  data?: unknown;
  confirmationRequired?: boolean;
  description?: string;
}

const TOOL_LABELS: Record<string, string> = {
  fetch_benefits: "Fetch benefits",
  fetch_equity: "Fetch equity grants",
  fetch_expenses: "Fetch expenses",
  create_expense: "Create expense",
  fetch_surveys: "Fetch surveys",
  create_survey: "Create survey",
  fetch_planning: "Fetch planning scenarios",
  create_scenario: "Create scenario",
  fetch_contractors: "Fetch contractors",
  create_contractor: "Register contractor",
  fetch_offboarding: "Fetch offboarding cases",
  approve_offboarding: "Approve offboarding",
  fetch_assets: "Fetch assets",
  create_asset: "Register asset",
  fetch_documents: "Fetch documents",
  screen_candidate: "Screen candidate",
  fetch_team_capacity: "Check seat capacity",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replaceAll("_", " ");
}

function humanizeArgs(arguments_: Record<string, unknown>): string {
  const entries = Object.entries(arguments_);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(" · ");
}

interface ToolStepCardProps {
  step: ToolStepState;
  onApprove?: (step: ToolStepState) => void;
  onDeny?: (step: ToolStepState) => void;
}

export function ToolStepCard({ step, onApprove, onDeny }: ToolStepCardProps) {
  const isApproval = step.confirmationRequired && step.status === "pending";

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 text-sm",
        step.status === "error"
          ? "border-destructive/30 bg-destructive/5"
          : step.status === "ok"
            ? "border-success/30 bg-success/5"
            : step.status === "denied"
              ? "border-border bg-muted/40 opacity-70"
              : "border-border bg-card",
      )}
      data-testid="tool-step-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wrench className="h-3.5 w-3.5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{toolLabel(step.name)}</span>
              <ToolStatusBadge step={step} />
            </div>
            {step.arguments && Object.keys(step.arguments).length > 0 && (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {humanizeArgs(step.arguments)}
              </p>
            )}
            {isApproval && (
              <p className="text-xs text-muted-foreground">
                {step.description ??
                  "This action will modify your workspace data."}
              </p>
            )}
            {!isApproval && step.message && (
              <p
                className={cn(
                  "text-xs",
                  step.status === "error" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {step.message}
              </p>
            )}
          </div>
        </div>

        {isApproval && onApprove && onDeny && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDeny(step)}
              aria-label={`Deny ${toolLabel(step.name)}`}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Deny
            </Button>
            <Button
              size="sm"
              onClick={() => onApprove(step)}
              aria-label={`Approve ${toolLabel(step.name)}`}
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        )}
      </div>

      {step.status === "ok" && Boolean(step.data) && <ToolResultCard step={step} />}
    </div>
  );
}

function ToolStatusBadge({ step }: { step: ToolStepState }) {
  switch (step.status) {
    case "executing":
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case "ok":
      return (
        <Badge variant="outline" className="gap-1 text-success">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </Badge>
      );
    case "error":
      return (
        <Badge variant="outline" className="gap-1 text-destructive">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case "denied":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Ban className="h-3 w-3" />
          Denied
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          Awaiting approval
        </Badge>
      );
  }
}

interface ResultRow {
  id: string;
  status?: string | null;
  recommendation?: string | null;
  [key: string]: unknown;
}

function statusTone(value: string | undefined | null): "success" | "warning" | "destructive" | "default" {
  if (!value) return "default";
  switch (value.toLowerCase()) {
    case "completed":
    case "active":
    case "advance":
    case "approved":
    case "paid":
    case "submitted":
    case "enrolled":
      return "success";
    case "planned":
    case "in_progress":
    case "hold":
    case "pending":
    case "draft":
      return "warning";
    case "reject":
    case "rejected":
    case "cancelled":
    case "terminated":
      return "destructive";
    default:
      return "default";
  }
}

function BadgeFor({ label, value }: { label: string; value: string }) {
  const tone = statusTone(value);
  return (
    <Badge
      variant={tone === "destructive" ? "destructive" : "outline"}
      className={cn(
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
      )}
    >
      {label}: {value}
    </Badge>
  );
}

/**
 * Inline result card for state-modifying tools — renders live status badges
 * derived from the CRUD route's response row (status, recommendation, score).
 */
export function ToolResultCard({ step }: { step: ToolStepState }) {
  const data = step.data as ResultRow | ResultRow[] | null | undefined;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const badges: Array<{ label: string; value: string }> = [];
  if (typeof row.status === "string" && row.status) {
    badges.push({ label: "Status", value: row.status });
  }
  if (typeof row.recommendation === "string" && row.recommendation) {
    badges.push({ label: "Recommendation", value: row.recommendation });
  }
  if (typeof row.score === "number") {
    badges.push({ label: "Score", value: String(row.score) });
  }
  if (badges.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="tool-result-card">
      {badges.map((badge) => (
        <BadgeFor key={badge.label} label={badge.label} value={badge.value} />
      ))}
    </div>
  );
}
