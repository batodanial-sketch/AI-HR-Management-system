"use client";

import * as React from "react";
import {
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { postAi } from "@/lib/ai-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsSeries } from "@/lib/types";

type Severity = "info" | "positive" | "warning" | "critical";

interface Insight {
  title: string;
  description: string;
  severity: Severity;
  metric: string;
}

const SEVERITY_META: Record<
  Severity,
  { icon: typeof Info; tone: string; label: string }
> = {
  info: { icon: Info, tone: "bg-muted text-muted-foreground", label: "Info" },
  positive: { icon: ThumbsUp, tone: "bg-success/15 text-success", label: "Positive" },
  warning: { icon: AlertTriangle, tone: "bg-warning/15 text-warning", label: "Warning" },
  critical: { icon: AlertTriangle, tone: "bg-destructive/15 text-destructive", label: "Critical" },
};

export function AiInsightsPanel({
  headcount,
  payrollDistribution,
  timeToHire,
}: {
  headcount: AnalyticsSeries[];
  payrollDistribution: AnalyticsSeries[];
  timeToHire: AnalyticsSeries[];
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [insights, setInsights] = React.useState<Insight[]>([]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await postAi<{ insights: Insight[] }>("/api/ai/insights", {
        metrics: {
          headcount: headcount.map((item) => ({ label: item.label, value: item.value })),
          payroll_distribution: payrollDistribution.map((item) => ({
            department: item.label,
            share: item.value,
          })),
          time_to_hire_days: timeToHire.map((item) => ({
            label: item.label,
            value: item.value,
          })),
        },
      });
      setInsights(result.insights ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Insights failed — is the AI bridge running?",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass" data-testid="analytics-chart-insights">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">AI Insights</CardTitle>
          <p className="text-xs text-muted-foreground">
            Anomalies and opportunities detected by Groq.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void generate()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {insights.length === 0 && !error && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Click “Generate” to surface AI insights from your analytics.
          </p>
        )}

        <div className="space-y-3">
          {insights.map((insight, index) => {
            const meta = SEVERITY_META[insight.severity];
            const Icon = meta.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border border-border/70 bg-card/40 p-3"
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {insight.metric}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {insight.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
