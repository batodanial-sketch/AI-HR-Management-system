"use client";

import * as React from "react";
import { Loader2, Search, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listWorkflowExecutionsAction, type WorkflowExecutionView } from "@/app/actions/workflowActions";
import { formatDate } from "@/lib/utils";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_VARIANTS: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive"; icon: React.ReactNode }> = {
  queued: { label: "Queued", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  running: { label: "Running", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  succeeded: { label: "Succeeded", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: "Failed", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", variant: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
};

export function ExecutionLogs() {
  const [statusFilter, setStatusFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [logs, setLogs] = React.useState<WorkflowExecutionView[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWorkflowExecutionsAction({
        status: statusFilter || undefined,
        page,
        pageSize: 50,
      });
      if (res.success) {
        // Client-side search filter for error_log and payload
        let rows = res.data.rows;
        if (debouncedSearch) {
          const lower = debouncedSearch.toLowerCase();
          rows = rows.filter(
            (r) =>
              r.errorLog?.toLowerCase().includes(lower) ||
              JSON.stringify(r.executionPayload).toLowerCase().includes(lower) ||
              JSON.stringify(r.resultJson).toLowerCase().includes(lower) ||
              r.workflowTemplateId?.toLowerCase().includes(lower) ||
              r.taskId?.toLowerCase().includes(lower),
          );
        }
        setLogs(rows);
        setTotal(res.data.total);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to load execution logs.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Execution Telemetry — workflow_executions
        </CardTitle>
        <CardDescription>Searchable, filterable log of status (queued, running, succeeded, failed), duration ms, and error logs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="exec-search">Search logs</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="exec-search"
                className={`${inputClass} pl-8`}
                placeholder="error, payload, template id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exec-status">Status</Label>
            <select
              id="exec-status"
              className={inputClass}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm" data-testid="execution-logs-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Template / Task</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium">Triggered By</th>
                <th className="px-4 py-3 font-medium">Executed At</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => {
                const info = STATUS_VARIANTS[row.status] ?? STATUS_VARIANTS.queued;
                return (
                  <React.Fragment key={row.id}>
                    <tr className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <Badge variant={info.variant as never} className="flex w-fit items-center gap-1">
                          {info.icon} {info.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-mono text-xs">tmpl: {row.workflowTemplateId?.slice(0, 8) ?? "—"}</p>
                          <p className="font-mono text-xs">task: {row.taskId?.slice(0, 8) ?? "—"}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{row.id.slice(0, 8)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.durationMs != null ? `${row.durationMs} ms` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {row.triggeredBy}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.executedAt)}</td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                          {expanded === row.id ? "Hide" : "View"}
                        </Button>
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr className="bg-secondary/20">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="space-y-3">
                            {row.errorLog && (
                              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                                <p className="text-xs font-semibold text-destructive">Error Log</p>
                                <pre className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap text-xs text-destructive">
                                  {row.errorLog}
                                </pre>
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                              <div className="rounded-md bg-secondary/50 p-3">
                                <p className="text-xs font-semibold">Execution Payload</p>
                                <pre className="mt-1 max-h-[200px] overflow-auto text-xs">
                                  {JSON.stringify(row.executionPayload, null, 2)}
                                </pre>
                              </div>
                              <div className="rounded-md bg-secondary/50 p-3">
                                <p className="text-xs font-semibold">Result JSON</p>
                                <pre className="mt-1 max-h-[200px] overflow-auto text-xs">
                                  {JSON.stringify(row.resultJson, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading execution logs...
          </div>
        )}

        {!loading && logs.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-muted-foreground">No execution logs found. Generate workflows via cron or manual trigger.</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{total} execution records</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm tabular-nums">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
