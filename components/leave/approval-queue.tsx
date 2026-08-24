"use client";

import * as React from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { resolveLeaveRequest } from "@/lib/actions";
import { postAi } from "@/lib/ai-client";
import { useUser } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { LeaveRequest } from "@/lib/types";

interface PtoAiDecision {
  employee_id: string;
  decision: "approve" | "reject" | "escalate";
  confidence: number;
  reasoning: string;
}

const TYPE_LABEL: Record<LeaveRequest["type"], string> = {
  pto: "PTO",
  sick: "Sick",
  unpaid: "Unpaid",
};

const STATUS_VARIANT: Record<LeaveRequest["status"], "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

/**
 * Manager approval queue with instant approve/reject actions. State is managed
 * locally for optimistic updates and persisted through the server action.
 */
export function ApprovalQueue({ requests }: { requests: LeaveRequest[] }) {
  const user = useUser();
  const canApprove =
    user.role === "owner" || user.role === "admin" || user.role === "manager";
  const [items, setItems] = React.useState<LeaveRequest[]>(requests);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [aiCheckingId, setAiCheckingId] = React.useState<string | null>(null);
  const [aiDecisions, setAiDecisions] = React.useState<Record<string, PtoAiDecision>>({});

  const resolve = async (id: string, status: "approved" | "rejected") => {
    setPendingId(id);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    await resolveLeaveRequest(id, status);
    setPendingId(null);
  };

  const runAiCheck = async (request: LeaveRequest) => {
    setAiCheckingId(request.id);
    try {
      const decision = await postAi<PtoAiDecision>("/api/ai/evaluate-pto", {
        employee_id: request.employeeId,
        employee_name: request.employeeName,
        leave_type: request.type,
        start_date: request.startDate,
        end_date: request.endDate,
        reason: request.reason,
        balance_days: 20,
        team_absences: 1,
      });
      setAiDecisions((prev) => ({ ...prev, [request.id]: decision }));
    } catch {
      setAiDecisions((prev) => ({
        ...prev,
        [request.id]: {
          employee_id: request.employeeId,
          decision: "escalate",
          confidence: 0,
          reasoning: "AI check unavailable — is the bridge running?",
        },
      }));
    } finally {
      setAiCheckingId(null);
    }
  };

  const applyAiDecision = async (request: LeaveRequest) => {
    const decision = aiDecisions[request.id];
    if (!decision || decision.decision === "escalate") {
      return;
    }
    await resolve(
      request.id,
      decision.decision === "approve" ? "approved" : "rejected",
    );
    setAiDecisions((prev) => {
      const next = { ...prev };
      delete next[request.id];
      return next;
    });
  };

  const pending = items.filter((item) => item.status === "pending");
  const resolved = items.filter((item) => item.status !== "pending");

  return (
    <div
      data-testid="leave-approval-queue"
      className="glass overflow-hidden rounded-xl"
    >
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">Approval queue</h3>
        <p className="text-xs text-muted-foreground">
          {pending.length} request{pending.length === 1 ? "" : "s"} awaiting action
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {items.map((request) => (
          <div
            key={request.id}
            data-testid="leave-request-row"
            data-employee-id={request.employeeId}
            data-status={request.status}
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{request.employeeName}</p>
                <Badge variant="secondary">{TYPE_LABEL[request.type]}</Badge>
                <Badge variant={STATUS_VARIANT[request.status]}>
                  {request.status}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(request.startDate)} → {formatDate(request.endDate)}
                {request.reason ? ` · ${request.reason}` : ""}
              </p>
            </div>

            {request.status === "pending" && canApprove ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="leave-ai-check-button"
                  disabled={aiCheckingId === request.id}
                  onClick={() => void runAiCheck(request)}
                  title="Run AI evaluation"
                >
                  {aiCheckingId === request.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-primary" />
                  )}
                  AI check
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="leave-approve-button"
                  disabled={pendingId === request.id}
                  onClick={() => void resolve(request.id, "approved")}
                >
                  <Check className="h-4 w-4 text-success" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="leave-reject-button"
                  disabled={pendingId === request.id}
                  onClick={() => void resolve(request.id, "rejected")}
                >
                  <X className="h-4 w-4 text-destructive" /> Reject
                </Button>
              </div>
            ) : null}

            {aiDecisions[request.id] && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold">
                    AI: {aiDecisions[request.id].decision}
                  </span>
                  <span className="text-muted-foreground">
                    ({Math.round(aiDecisions[request.id].confidence * 100)}%)
                  </span>
                  {aiDecisions[request.id].decision !== "escalate" && (
                    <button
                      className="ml-auto font-medium text-primary hover:underline"
                      onClick={() => void applyAiDecision(request)}
                    >
                      Apply
                    </button>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {aiDecisions[request.id].reasoning}
                </p>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No leave requests yet.
          </div>
        )}

        {/* Resolved requests are collapsed into a footer summary */}
        {resolved.length > 0 && (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            {resolved.length} request{resolved.length === 1 ? "" : "s"} already
            resolved this period.
          </p>
        )}
      </div>
    </div>
  );
}
