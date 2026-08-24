"use client";

import * as React from "react";
import { FileText, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { postAi } from "@/lib/ai-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Candidate, Recommendation } from "@/lib/types";

interface InterviewReportResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  score: number;
  recommendation: Recommendation;
  next_steps: string[];
}

const RECOMMENDATION_VARIANT: Record<Recommendation, "success" | "warning" | "destructive"> = {
  advance: "success",
  hold: "warning",
  reject: "destructive",
};

export function InterviewReportButton({ candidate }: { candidate: Candidate }) {
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<InterviewReportResult | null>(null);

  const fullName = `${candidate.firstName} ${candidate.lastName}`;

  const handleGenerate = async () => {
    if (!notes.trim()) {
      setError("Add some interview notes first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await postAi<InterviewReportResult>(
        "/api/ai/interview-report",
        {
          candidate_name: fullName,
          role: candidate.role,
          stage: candidate.stage,
          interview_notes: notes,
          prior_score: candidate.matchScore,
        },
      );
      setReport(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Report generation failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="interview-report-button">
          <FileText className="h-4 w-4" /> Interview report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Interview report — {fullName}
          </DialogTitle>
          <DialogDescription>
            Paste interview notes and generate a structured report.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Paste interview notes, impressions, technical questions…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-[120px]"
        />

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {report && (
          <div className="max-h-80 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-primary/30 text-sm font-bold tabular-nums">
                {report.score}
              </span>
              <Badge variant={RECOMMENDATION_VARIANT[report.recommendation]}>
                {report.recommendation}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{report.summary}</p>

            <ListBlock icon={<Plus className="h-3.5 w-3.5 text-success" />} title="Strengths" items={report.strengths} />
            <ListBlock icon={<Minus className="h-3.5 w-3.5 text-destructive" />} title="Weaknesses" items={report.weaknesses} />
            <ListBlock icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} title="Next steps" items={report.next_steps} />
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListBlock({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </p>
      <ul className="list-inside list-disc space-y-0.5 text-sm">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
