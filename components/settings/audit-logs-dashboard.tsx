"use client";

import * as React from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AUDIT_ACTION_VERBS,
  exportAuditLogsCSV,
  exportAuditLogsJSON,
  listAuditLogsAction,
  type AuditLogListResult,
} from "@/app/actions/audit";
import type { OrgMember } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface AuditLogsDashboardProps {
  members: OrgMember[];
}

interface AuditFilter {
  search: string;
  action: string;
  actorUserId: string;
  from: string;
  to: string;
}

const EMPTY_FILTER: AuditFilter = {
  search: "",
  action: "",
  actorUserId: "",
  from: "",
  to: "",
};

const PAGE_SIZE = 25;

function download(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background/60 px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AuditLogsDashboard({ members }: AuditLogsDashboardProps) {
  const [filter, setFilter] = React.useState<AuditFilter>(EMPTY_FILTER);
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<AuditLogListResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState<"csv" | "json" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Debounce the free-text search; other filters fetch immediately.
  const [debouncedSearch, setDebouncedSearch] = React.useState(filter.search);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filter.search), 350);
    return () => clearTimeout(id);
  }, [filter.search]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listAuditLogsAction({
      search: debouncedSearch || undefined,
      action: filter.action ? (filter.action as (typeof AUDIT_ACTION_VERBS)[number]) : undefined,
      actorUserId: filter.actorUserId || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setResult(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load audit logs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filter.action, filter.actorUserId, filter.from, filter.to, page]);

  const setFilterField = <K extends keyof AuditFilter>(
    key: K,
    value: AuditFilter[K],
  ) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const activeFilter = (): Parameters<typeof listAuditLogsAction>[0] => ({
    search: debouncedSearch || undefined,
    action: filter.action ? (filter.action as (typeof AUDIT_ACTION_VERBS)[number]) : undefined,
    actorUserId: filter.actorUserId || undefined,
    from: filter.from || undefined,
    to: filter.to || undefined,
  });

  const handleExport = async (kind: "csv" | "json") => {
    setExporting(kind);
    try {
      const payload = activeFilter();
      const res =
        kind === "csv"
          ? await exportAuditLogsCSV(payload)
          : await exportAuditLogsJSON(payload);
      if (res.success) {
        download(res.data.filename, res.data.content, res.data.contentType);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Export failed.");
    } finally {
      setExporting(null);
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="glass rounded-xl p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="audit-search">Search resource</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="audit-search"
                className={`${inputClass} pl-8`}
                placeholder="entity_type, …"
                value={filter.search}
                onChange={(event) => setFilterField("search", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-action">Action type</Label>
            <select
              id="audit-action"
              className={inputClass}
              value={filter.action}
              onChange={(event) => setFilterField("action", event.target.value)}
            >
              <option value="">All actions</option>
              {AUDIT_ACTION_VERBS.map((verb) => (
                <option key={verb} value={verb}>
                  {verb}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-actor">Team member</Label>
            <select
              id="audit-actor"
              className={inputClass}
              value={filter.actorUserId}
              onChange={(event) => setFilterField("actorUserId", event.target.value)}
            >
              <option value="">All members</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-from">From</Label>
            <input
              id="audit-from"
              type="date"
              className={inputClass}
              value={filter.from}
              onChange={(event) => setFilterField("from", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-to">To</Label>
            <input
              id="audit-to"
              type="date"
              className={inputClass}
              value={filter.to}
              onChange={(event) => setFilterField("to", event.target.value)}
            />
          </div>
        </div>

        {/* Export controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport("csv")}
            disabled={exporting !== null}
          >
            {exporting === "csv" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport("json")}
            disabled={exporting !== null}
          >
            {exporting === "json" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export JSON
          </Button>
        </div>
      </div>

      {/* Table */}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="audit-logs-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Resource</th>
                <th className="px-4 py-3 font-medium">IP Address</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {(result?.rows ?? []).map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/60 last:border-0 hover:bg-secondary/30"
                >
                  <td className="px-4 py-3 font-medium">
                    {row.actorName ?? row.actorId ?? "System"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.actionLabel}</td>
                  <td className="px-4 py-3 capitalize">
                    {row.resourceType}
                    {row.resourceId ? (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {row.resourceId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && !error && (result?.rows.length ?? 0) === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No audit records match the current filters.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {result ? `${result.total} record${result.total === 1 ? "" : "s"}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <span className="text-sm tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
