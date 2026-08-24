"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HealthComponent {
  status: "ok" | "degraded" | "down";
  label: string;
  detail: string;
}

interface HealthReport {
  status: "ok" | "degraded" | "down";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  components: HealthComponent[];
  summary: {
    aiProvider: string;
    memoryProvider: string;
    licenseTier: string;
    headcount: number;
    user: string;
  };
}

const STATUS_META = {
  ok: { icon: CheckCircle2, tone: "text-success", label: "Operational", badge: "success" as const },
  degraded: { icon: AlertTriangle, tone: "text-warning", label: "Degraded", badge: "warning" as const },
  down: { icon: XCircle, tone: "text-destructive", label: "Down", badge: "destructive" as const },
};

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * System Health panel — live status of the AI bridge, memory backend, license
 * and app version, with a manual refresh.
 */
export function SystemHealth() {
  const [report, setReport] = React.useState<HealthReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void fetch("/api/system/health")
      .then((response) => response.json())
      .then((data: HealthReport) => setReport(data))
      .catch(() => setError("Could not load health data."))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading && !report) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error ?? "Health data unavailable."}
      </div>
    );
  }

  const overall = STATUS_META[report.status];
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-5">
      {/* Overall status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl border",
              report.status === "ok"
                ? "border-success/30 bg-success/10"
                : report.status === "degraded"
                  ? "border-warning/30 bg-warning/10"
                  : "border-destructive/30 bg-destructive/10",
            )}
          >
            <OverallIcon className={cn("h-6 w-6", overall.tone)} />
          </div>
          <div>
            <p className="text-sm font-semibold">{overall.label}</p>
            <p className="text-xs text-muted-foreground">
              v{report.version} · up {formatUptime(report.uptimeSeconds)}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryItem label="AI provider" value={report.summary.aiProvider} />
        <SummaryItem label="Memory" value={report.summary.memoryProvider} />
        <SummaryItem label="License" value={report.summary.licenseTier.toUpperCase()} />
        <SummaryItem label="Headcount" value={String(report.summary.headcount)} />
      </div>

      {/* Components */}
      <div className="space-y-2">
        {report.components.map((component) => {
          const meta = STATUS_META[component.status];
          const Icon = meta.icon;
          return (
            <div
              key={component.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className={cn("h-5 w-5 shrink-0", meta.tone)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{component.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {component.detail}
                  </p>
                </div>
              </div>
              <Badge variant={meta.badge}>{meta.label}</Badge>
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Last checked {new Date(report.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
      <p className="label-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
