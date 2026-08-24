"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { streamAi } from "@/lib/ai-client";
import { moveCandidateStage } from "@/lib/actions";
import type { AiEvaluation, Candidate, RecruitmentStage } from "@/lib/types";
import { CandidateCard } from "./candidate-card";
import { AiEvaluationPanel } from "./ai-evaluation";

const STAGES: Array<{ id: RecruitmentStage; label: string; tint: string }> = [
  { id: "applied", label: "Applied", tint: "bg-muted-foreground" },
  { id: "screening", label: "Screening", tint: "bg-primary" },
  { id: "interview", label: "Interview", tint: "bg-warning" },
  { id: "offer", label: "Offer", tint: "bg-accent" },
  { id: "hired", label: "Hired", tint: "bg-success" },
];

/** Builds a deterministic Groq evaluation for a candidate (offline fallback). */
function buildEvaluation(candidate: Candidate): AiEvaluation {
  const recommendation: AiEvaluation["recommendation"] =
    candidate.matchScore >= 85
      ? "advance"
      : candidate.matchScore >= 75
        ? "hold"
        : "reject";

  const summaries: Record<AiEvaluation["recommendation"], string> = {
    advance:
      "Strong signal across technical fit and communication. Recommended to advance to the next stage.",
    hold: "Mixed signal on experience depth. Keep in pipeline and revisit after the next interview batch.",
    reject: "Skills profile does not match the role requirements closely enough.",
  };

  return {
    candidateId: candidate.id,
    candidateName: `${candidate.firstName} ${candidate.lastName}`,
    score: candidate.matchScore,
    summary: summaries[recommendation],
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

/** Wire shape of the bridge's candidate-evaluation "done" event. */
interface CandidateEvaluationDone {
  candidate_id?: string;
  candidate_name?: string;
  candidateName?: string;
  score?: number;
  summary?: string;
  recommendation?: AiEvaluation["recommendation"];
}

/**
 * Runs a live Groq screening through the AI bridge. Falls back to the
 * deterministic evaluation only when the bridge is unreachable (offline).
 */
async function evaluateCandidate(candidate: Candidate): Promise<AiEvaluation> {
  try {
    const box: { result: CandidateEvaluationDone | null } = { result: null };
    await streamAi<CandidateEvaluationDone>(
      "/api/ai/evaluate-candidate",
      {
        candidate_id: candidate.id,
        candidate_name: `${candidate.firstName} ${candidate.lastName}`,
        role: candidate.role,
        match_score: candidate.matchScore,
        stage: candidate.stage,
      },
      {
        onDelta: () => {},
        onDone: (done) => {
          box.result = done;
        },
      },
    );
    const result = box.result;
    if (result) {
      return {
        candidateId: result.candidate_id ?? candidate.id,
        candidateName:
          result.candidate_name ??
          result.candidateName ??
          `${candidate.firstName} ${candidate.lastName}`,
        score: result.score ?? candidate.matchScore,
        summary: result.summary ?? "",
        recommendation: result.recommendation ?? "hold",
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Bridge unreachable — fall through to the offline evaluation.
  }
  return buildEvaluation(candidate);
}

/**
 * Multi-column recruitment kanban with native drag-and-drop between stages and
 * inline Groq AI evaluation.
 */
export function KanbanBoard({ initialCandidates }: { initialCandidates: Candidate[] }) {
  const [candidates, setCandidates] = React.useState<Candidate[]>(initialCandidates);
  const [evaluation, setEvaluation] = React.useState<AiEvaluation | null>(null);
  const [evaluatedCandidate, setEvaluatedCandidate] = React.useState<Candidate | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<RecruitmentStage | null>(null);

  const runEvaluation = async (candidate: Candidate) => {
    const result = await evaluateCandidate(candidate);
    setEvaluation(result);
    setEvaluatedCandidate(candidate);
  };

  const moveCandidate = async (id: string, stage: RecruitmentStage) => {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate || candidate.stage === stage) {
      return;
    }
    setCandidates((prev) =>
      prev.map((item) => (item.id === id ? { ...item, stage } : item)),
    );
    await runEvaluation({ ...candidate, stage });
    await moveCandidateStage(id, stage);
  };

  const handleDrop = (event: React.DragEvent, stage: RecruitmentStage) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    setDragOverStage(null);
    if (id) {
      void moveCandidate(id, stage);
    }
  };

  return (
    <div className="space-y-4">
      {evaluation && (
        <AiEvaluationPanel
          evaluation={evaluation}
          candidate={evaluatedCandidate ?? undefined}
          onClose={() => {
            setEvaluation(null);
            setEvaluatedCandidate(null);
          }}
        />
      )}

      <div
        data-testid="kanban-board"
        className="flex gap-4 overflow-x-auto pb-4 [scroll-snap-type:x_mandatory]"
      >
        {STAGES.map((stage) => {
          const stageCandidates = candidates.filter(
            (candidate) => candidate.stage === stage.id,
          );
          return (
            <div
              key={stage.id}
              data-testid="kanban-column"
              data-stage={stage.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage((prev) => (prev === stage.id ? null : prev))}
              onDrop={(event) => handleDrop(event, stage.id)}
              className={cn(
                "flex min-w-[280px] flex-1 snap-start flex-col rounded-xl border border-border/70 bg-card/40 p-3 transition-colors",
                dragOverStage === stage.id && "border-primary/50 bg-primary/5",
              )}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", stage.tint)} />
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {stageCandidates.length}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Add to ${stage.label}`}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex min-h-24 flex-col gap-2.5">
                {stageCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    onDragStart={() => undefined}
                    onScreen={(item) => {
                      void runEvaluation(item);
                    }}
                  />
                ))}
                {stageCandidates.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
                    Drop candidates here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
