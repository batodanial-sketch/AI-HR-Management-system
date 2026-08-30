"use client";

import * as React from "react";
import { Gauge, Loader2, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * AI Budget & Usage widget (Settings → AI Usage & Spend).
 *
 * Live meters for the current month (tokens + cost), per-model and
 * per-feature breakdown, monthly cap controls, and fallback-model routing —
 * admins set the caps; the Copilot orchestrator enforces them and routes to
 * the fallback when limits are approached.
 */

interface UsageSummary {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  byFeature: Array<{ feature: string; requests: number; totalTokens: number; costUsd: number }>;
  byModel: Array<{ model: string; requests: number; totalTokens: number }>;
}

interface BudgetSettings {
  monthlyTokenCap: number | null;
  monthlyCostCapUsd: number | null;
  fallbackModel: string | null;
  fallbackProvider: string | null;
  enabled: boolean;
}

interface BudgetDecision {
  allowed: boolean;
  threshold: "ok" | "warning" | "exceeded";
  remainingTokens: number | null;
  remainingCostUsd: number | null;
  fallbackModel: string | null;
}

interface BudgetPayload {
  ok: boolean;
  error?: string;
  summary?: UsageSummary;
  budget?: BudgetSettings;
  decision?: BudgetDecision;
}

const EMPTY_SUMMARY: UsageSummary = {
  requests: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  byFeature: [],
  byModel: [],
};

function fmtTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function AiBudgetPanel() {
  const { toast } = useToast();
  const [summary, setSummary] = React.useState<UsageSummary>(EMPTY_SUMMARY);
  const [budget, setBudget] = React.useState<BudgetSettings | null>(null);
  const [decision, setDecision] = React.useState<BudgetDecision | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [tokenCap, setTokenCap] = React.useState("");
  const [costCap, setCostCap] = React.useState("");
  const [fallbackModel, setFallbackModel] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/settings/ai-budget", { cache: "no-store" });
      const payload = (await response.json()) as BudgetPayload;
      if (!response.ok || !payload.ok) {
        toast({ variant: "error", title: "Unable to load AI budget", description: payload.error });
        return;
      }
      setSummary(payload.summary ?? EMPTY_SUMMARY);
      setBudget(payload.budget ?? null);
      setDecision(payload.decision ?? null);
      setTokenCap(payload.budget?.monthlyTokenCap ? String(payload.budget.monthlyTokenCap) : "");
      setCostCap(payload.budget?.monthlyCostCapUsd ? String(payload.budget.monthlyCostCapUsd) : "");
      setFallbackModel(payload.budget?.fallbackModel ?? "");
    } catch {
      toast({ variant: "error", title: "Unable to load AI budget", description: "Could not reach the budget endpoint." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai-budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyTokenCap: tokenCap.trim() ? Number(tokenCap) : null,
          monthlyCostCapUsd: costCap.trim() ? Number(costCap) : null,
          fallbackModel: fallbackModel.trim() || null,
        }),
      });
      const payload = (await response.json()) as BudgetPayload;
      if (!response.ok || !payload.ok) {
        toast({
          variant: "error",
          title: response.status === 403 ? "Not authorized" : "Save failed",
          description: payload.error ?? "Unable to save budget settings.",
        });
        return;
      }
      setBudget(payload.budget ?? null);
      setDecision(payload.decision ?? null);
      setSummary(payload.summary ?? EMPTY_SUMMARY);
      toast({ variant: "success", title: "AI budget saved", description: "New caps are enforced on the next request." });
    } catch {
      toast({ variant: "error", title: "Save failed", description: "Could not reach the budget endpoint." });
    } finally {
      setSaving(false);
    }
  }, [tokenCap, costCap, fallbackModel, toast]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI budget…
        </div>
      </Card>
    );
  }

  const tokenUsed = summary.totalTokens;
  const tokenLimit = budget?.monthlyTokenCap ?? null;
  const tokenPercent =
    tokenLimit && tokenLimit > 0 ? Math.min(100, Math.round((tokenUsed / tokenLimit) * 100)) : 0;
  const costPercent =
    budget?.monthlyCostCapUsd && budget.monthlyCostCapUsd > 0
      ? Math.min(100, Math.round((summary.costUsd / budget.monthlyCostCapUsd) * 100))
      : 0;

  return (
    <Card className="space-y-6 p-6" data-testid="ai-budget-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">AI Budget &amp; Usage</h2>
        </div>
        <Badge
          variant={
            decision?.threshold === "exceeded"
              ? "destructive"
              : decision?.threshold === "warning"
                ? "outline"
                : "default"
          }
          className={cn(decision?.threshold === "warning" && "text-warning")}
        >
          {decision?.threshold === "exceeded"
            ? "Cap exceeded — requests paused"
            : decision?.threshold === "warning"
              ? "Approaching cap"
              : "Within budget"}
        </Badge>
      </div>

      {/* ── Meters ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Tokens this month</span>
            <span className="font-semibold tabular-nums">
              {fmtTokens(tokenUsed)}
              {tokenLimit ? ` / ${fmtTokens(tokenLimit)}` : ""}
            </span>
          </div>
          <Progress value={tokenPercent} className="h-2" />
          {!tokenLimit && (
            <p className="text-xs text-muted-foreground">No token cap configured.</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Cost this month</span>
            <span className="font-semibold tabular-nums">
              {fmtUsd(summary.costUsd)}
              {budget?.monthlyCostCapUsd ? ` / ${fmtUsd(budget.monthlyCostCapUsd)}` : ""}
            </span>
          </div>
          <Progress value={costPercent} className="h-2" />
          {!budget?.monthlyCostCapUsd && (
            <p className="text-xs text-muted-foreground">No cost cap configured.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests" value={String(summary.requests)} />
        <Stat label="Prompt tokens" value={fmtTokens(summary.promptTokens)} />
        <Stat label="Completion tokens" value={fmtTokens(summary.completionTokens)} />
        <Stat label="Estimated cost" value={fmtUsd(summary.costUsd)} />
      </div>

      {/* ── Breakdowns ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">By feature</p>
          {summary.byFeature.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded yet this month.</p>
          ) : (
            <ul className="space-y-1.5">
              {summary.byFeature.slice(0, 6).map((entry) => (
                <li key={entry.feature} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{entry.feature}</span>
                  <span className="tabular-nums">
                    {fmtTokens(entry.totalTokens)} · {entry.requests} calls
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">By model</p>
          {summary.byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded yet this month.</p>
          ) : (
            <ul className="space-y-1.5">
              {summary.byModel.slice(0, 6).map((entry) => (
                <li key={entry.model} className="flex justify-between text-sm">
                  <span className="truncate text-muted-foreground">{entry.model}</span>
                  <span className="tabular-nums">{fmtTokens(entry.totalTokens)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Controls (HR_ADMIN+) ───────────────────────────────── */}
      <div className="rounded-xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-primary" />
          Monthly caps &amp; fallback routing
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          When caps are approached (&gt;80%) the Copilot warns and suggests the fallback
          model; when exceeded, requests pause until the cap resets.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            Token cap / month
            <Input
              type="number"
              min={0}
              placeholder="10,000,000"
              value={tokenCap}
              onChange={(event) => setTokenCap(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Cost cap / month (USD)
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="500"
              value={costCap}
              onChange={(event) => setCostCap(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Fallback model
            <Input
              placeholder="llama-3.1-8b-instant"
              value={fallbackModel}
              onChange={(event) => setFallbackModel(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Save budget settings
          </Button>
          {budget?.fallbackProvider && (
            <span className="text-xs text-muted-foreground">
              Current fallback: {budget.fallbackModel} via {budget.fallbackProvider}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
