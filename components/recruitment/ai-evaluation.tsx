"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Bot, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InterviewReportButton } from "./interview-report";
import type { AiEvaluation, Candidate, Recommendation } from "@/lib/types";

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  advance: "Advance",
  hold: "Hold",
  reject: "Reject",
};

const RECOMMENDATION_VARIANT: Record<
  Recommendation,
  "success" | "warning" | "destructive"
> = {
  advance: "success",
  hold: "warning",
  reject: "destructive",
};

/**
 * Groq AI evaluation result — rendered as a dismissible panel when a candidate
 * is screened or moved to a new stage.
 */
export function AiEvaluationPanel({
  evaluation,
  onClose,
  candidate,
}: {
  evaluation: AiEvaluation;
  onClose: () => void;
  candidate?: Candidate;
}) {
  return (
    <AnimatePresence>
      <motion.div
        key={evaluation.candidateId}
        data-testid="kanban-ai-evaluation"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className="ring-hairline relative rounded-xl border border-border bg-card p-4 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Groq AI Evaluation</p>
              <p className="text-xs text-muted-foreground">
                {evaluation.candidateName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Dismiss evaluation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-primary/30 text-sm font-bold tabular-nums">
            {evaluation.score}
          </div>
          <p className="flex-1 text-sm leading-snug text-muted-foreground">
            {evaluation.summary}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Badge variant={RECOMMENDATION_VARIANT[evaluation.recommendation]}>
            {RECOMMENDATION_LABEL[evaluation.recommendation]}
          </Badge>
          <div className="flex items-center gap-2">
            {candidate && <InterviewReportButton candidate={candidate} />}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              groq · gpt-oss-120b
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
