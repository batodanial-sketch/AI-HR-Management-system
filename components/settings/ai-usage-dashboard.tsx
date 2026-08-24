"use client";

import * as React from "react";
import { Download, Loader2, Search, Zap, Coins, BarChart3, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AI_FEATURES,
  exportAiUsageCSV,
  getAiSpendSummary,
  listAiUsageLogs,
  type AiSpendSummary,
  type AiUsageListResult,
} from "@/app/actions/aiUsageActions";
import { formatDate } from "@/lib/utils";

interface AiFilter {
  search: string;
  feature: string;
  model: string;
  from: string;
  to: string;
  days: string;
}

const PAGE_SIZE = 25;
const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function download(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function AiUsageDashboard() {
  const [filter, setFilter] = React.useState<AiFilter>({
    search: "",
    feature: "",
    model: "",
    from: "",
    to: "",
    days: "30",
  });
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [summary, setSummary] = React.useState<AiSpendSummary | null>(null);
  const [logs, setLogs] = React.useState<AiUsageListResult | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingLogs, setLoadingLogs] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // Debounce search
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filter.search), 350);
    return () => clearTimeout(id);
  }, [filter.search]);

  // Fetch summary
  React.useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    setError(null);

    const payload = {
      search: debouncedSearch || undefined,
      feature: filter.feature ? (filter.feature as (typeof AI_FEATURES)[number]) : undefined,
      model: filter.model || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      days: filter.days ? Number(filter.days) : 30,
    };

    getAiSpendSummary(payload)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setSummary(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load AI spend summary.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filter.feature, filter.model, filter.from, filter.to, filter.days]);

  // Fetch logs
  React.useEffect(() => {
    let cancelled = false;
    setLoadingLogs(true);

    const payload = {
      search: debouncedSearch || undefined,
      feature: filter.feature ? (filter.feature as (typeof AI_FEATURES)[number]) : undefined,
      model: filter.model || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      page,
      pageSize: PAGE_SIZE,
    };

    listAiUsageLogs(payload)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setLogs(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load AI usage logs.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLogs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filter.feature, filter.model, filter.from, filter.to, page]);

  const setFilterField = <K extends keyof AiFilter>(key: K, value: AiFilter[K]) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    if (key !== "days") setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = {
        search: debouncedSearch || undefined,
        feature: filter.feature ? (filter.feature as (typeof AI_FEATURES)[number]) : undefined,
        model: filter.model || undefined,
        from: filter.from || undefined,
        to: filter.to || undefined,
      };
      const res = await exportAiUsageCSV(payload);
      if (res.success) {
        download(res.data.filename, res.data.content, res.data.contentType);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = logs ? Math.max(1, Math.ceil(logs.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      {/* Tier-aware rate limit banner */}
      <div className="glass rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Tier-Aware Rate Limiting Active</h3>
            <p className="text-xs text-muted-foreground">
              AI gateway enforces per-tenant sliding-window limits keyed by <code>org:id:ip</code>. Trial:{" "}
              <Badge variant="secondary" className="mx-1">
                30 req/min
              </Badge>
              Pro:{" "}
              <Badge variant="secondary" className="mx-1">
                120 req/min
              </Badge>
              Enterprise:{" "}
              <Badge variant="secondary" className="mx-1">
                600 req/min
              </Badge>
              . Limits are enforced in both Next.js (`lib/rate-limit.ts`) and Python bridge (`bridge/rate_limit.py`) with{" "}
              <code>Retry-After</code> headers. Token counts are echoed via <code>X-Prompt-Tokens</code> /{" "}
              <code>X-Completion-Tokens</code> for accurate metering.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="ai-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="ai-search"
                className={`${inputClass} pl-8`}
                placeholder="feature, model…"
                value={filter.search}
                onChange={(e) => setFilterField("search", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-feature">Feature</Label>
            <select
              id="ai-feature"
              className={inputClass}
              value={filter.feature}
              onChange={(e) => setFilterField("feature", e.target.value)}
            >
              <option value="">All features</option>
              {AI_FEATURES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <input
              id="ai-model"
              className={inputClass}
              placeholder="gpt-4o, claude…"
              value={filter.model}
              onChange={(e) => setFilterField("model", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-from">From</Label>
            <input
              id="ai-from"
              type="date"
              className={inputClass}
              value={filter.from}
              onChange={(e) => setFilterField("from", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-to">To</Label>
            <input
              id="ai-to"
              type="date"
              className={inputClass}
              value={filter.to}
              onChange={(e) => setFilterField("to", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-days">Days (chart)</Label>
            <select
              id="ai-days"
              className={inputClass}
              value={filter.days}
              onChange={(e) => setFilterField("days", e.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
          <span className="text-xs text-muted-foreground">
            Org-scoped, RLS-protected. Exports up to 5000 rows. Audited as `export` action.
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin" /> : summary?.totalRequests ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">in selected window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSummary ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {formatTokens(summary?.totalTokens ?? 0)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({formatTokens(summary?.totalPromptTokens ?? 0)} in / {formatTokens(summary?.totalCompletionTokens ?? 0)} out)
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">prompt + completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSummary ? <Loader2 className="h-5 w-5 animate-spin" /> : formatCost(summary?.totalCostUsd ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary ? `avg ${formatCost(summary.totalRequests ? summary.totalCostUsd / summary.totalRequests : 0)}/req` : "USD"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Tokens / Req</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSummary ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : summary?.totalRequests ? (
                formatTokens(Math.round(summary.totalTokens / summary.totalRequests))
              ) : (
                "0"
              )}
            </div>
            <p className="text-xs text-muted-foreground">efficiency metric</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-feature & per-model breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Feature Breakdown</CardTitle>
            <CardDescription>Requests, tokens, and cost by AI feature</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : summary?.perFeature.length ? (
              <div className="space-y-3">
                {summary.perFeature.map((f) => (
                  <div key={f.feature} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {f.feature}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{f.requests} req</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTokens(f.totalTokens)} tokens · {formatCost(f.costUsd)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatCost(f.costUsd)}</div>
                      <div className="text-xs text-muted-foreground">{formatTokens(f.promptTokens)} in / {formatTokens(f.completionTokens)} out</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No feature data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Model Breakdown</CardTitle>
            <CardDescription>Usage by LLM model (BYOK)</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : summary?.perModel.length ? (
              <div className="space-y-3">
                {summary.perModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {m.model}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{m.requests} req</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTokens(m.totalTokens)} tokens
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatCost(m.costUsd)}</div>
                      <div className="text-xs text-muted-foreground">{formatTokens(m.promptTokens)} in / {formatTokens(m.completionTokens)} out</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No model data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily chart (simple bar) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Usage (Last {filter.days} Days)</CardTitle>
          <CardDescription>Requests and cost over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : summary?.daily.length ? (
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground sm:grid-cols-14 lg:grid-cols-30">
                {summary.daily.map((d) => {
                  const maxTokens = Math.max(...summary.daily.map((x) => x.totalTokens), 1);
                  const heightPct = maxTokens ? Math.max(5, (d.totalTokens / maxTokens) * 100) : 5;
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end justify-center">
                        <div
                          className="w-full rounded-sm bg-primary/70 transition-all hover:bg-primary"
                          style={{ height: `${heightPct}%` }}
                          title={`${d.date}: ${d.requests} req, ${formatTokens(d.totalTokens)} tokens, ${formatCost(d.costUsd)}`}
                        />
                      </div>
                      <span className="hidden sm:block">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-right">Requests</th>
                      <th className="px-2 py-1 text-right">Tokens</th>
                      <th className="px-2 py-1 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.daily
                      .slice()
                      .reverse()
                      .slice(0, 14)
                      .map((d) => (
                        <tr key={d.date} className="border-b border-border/40 last:border-0">
                          <td className="px-2 py-1 font-mono">{d.date}</td>
                          <td className="px-2 py-1 text-right">{d.requests}</td>
                          <td className="px-2 py-1 text-right">{formatTokens(d.totalTokens)}</td>
                          <td className="px-2 py-1 text-right">{formatCost(d.costUsd)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No daily data</p>
          )}
        </CardContent>
      </Card>

      {/* Searchable log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Usage Logs</CardTitle>
          <CardDescription>Searchable, paginated, org-scoped log of every AI call</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="ai-usage-table">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium text-right">Prompt</th>
                  <th className="px-4 py-3 font-medium text-right">Completion</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {(logs?.rows ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {row.feature}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatTokens(row.promptTokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatTokens(row.completionTokens)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatTokens(row.totalTokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCost(row.costUsd)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loadingLogs && (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!loadingLogs && !error && (logs?.rows.length ?? 0) === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No AI usage records match the current filters. Try adjusting search or date range, or make an AI call via Copilot / Candidate Evaluation.
            </div>
          )}

          <div className="flex items-center justify-between border-t p-4">
            <p className="text-xs text-muted-foreground">
              {logs ? `${logs.total} record${logs.total === 1 ? "" : "s"}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loadingLogs} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-sm tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loadingLogs}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
