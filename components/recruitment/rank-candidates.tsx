"use client";

import * as React from "react";
import { ArrowUpDown, Loader2, Sparkles } from "lucide-react";
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

interface RankingResult {
  candidate_id: string;
  candidate_name: string;
  score: number;
  reasoning: string;
  recommendation: Recommendation;
}

const RECOMMENDATION_VARIANT: Record<Recommendation, "success" | "warning" | "destructive"> = {
  advance: "success",
  hold: "warning",
  reject: "destructive",
};

export function RankCandidatesButton({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = React.useState(false);
  const [jobDescription, setJobDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rankings, setRankings] = React.useState<RankingResult[]>([]);

  const handleRank = async () => {
    if (!jobDescription.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await postAi<{ rankings: RankingResult[] }>(
        "/api/ai/rank-candidates",
        {
          job_description: jobDescription,
          candidates: candidates.map((candidate) => ({
            candidate_id: candidate.id,
            candidate_name: `${candidate.firstName} ${candidate.lastName}`,
            role: candidate.role,
            current_score: candidate.matchScore,
          })),
        },
      );
      setRankings(result.rankings ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ranking failed — is the AI bridge running?",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="rank-candidates-button">
          <ArrowUpDown className="h-4 w-4" /> Rank candidates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI candidate ranking
          </DialogTitle>
          <DialogDescription>
            Paste the job description and rank all candidates by fit.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Paste the job description…"
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          className="min-h-[140px]"
        />

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {rankings.length > 0 && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {rankings.map((ranking, index) => (
              <div
                key={ranking.candidate_id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {ranking.candidate_name}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">
                        {ranking.score}
                      </span>
                      <Badge variant={RECOMMENDATION_VARIANT[ranking.recommendation]}>
                        {ranking.recommendation}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ranking.reasoning}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => void handleRank()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Rank now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
