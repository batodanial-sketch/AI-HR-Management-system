"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileCheck2, Paperclip, Sparkles } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { updateCandidateResume } from "@/lib/actions";
import { storageConfigured, uploadResume } from "@/lib/supabase/storage";
import type { Candidate } from "@/lib/types";

/**
 * A single candidate card on the kanban board. Draggable via native HTML5
 * drag events (Playwright `dragTo` dispatches these), with an AI screening
 * trigger and a color-coded match score.
 */
export function CandidateCard({
  candidate,
  onDragStart,
  onScreen,
}: {
  candidate: Candidate;
  onDragStart: (candidate: Candidate) => void;
  onScreen: (candidate: Candidate) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fullName = `${candidate.firstName} ${candidate.lastName}`;

  const handleResumeUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !storageConfigured()) {
      return;
    }
    setUploading(true);
    try {
      const publicUrl = await uploadResume(candidate.id, file);
      await updateCandidateResume(candidate.id, publicUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileHover={{ y: -2 }}
    >
      <div
        draggable
        data-testid="kanban-card"
        data-candidate-id={candidate.id}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", candidate.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart(candidate);
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        className={cn(
          "group cursor-grab rounded-lg border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
          dragging && "scale-[1.03] rotate-1 ring-2 ring-primary/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <NameAvatar name={fullName} className="h-8 w-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {candidate.role}
              </p>
            </div>
          </div>
          <MatchScore score={candidate.matchScore} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {candidate.source}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="kanban-resume-upload-button"
              onClick={() => fileInputRef.current?.click()}
              title={
                candidate.resumeUrl ? "Resume attached" : "Attach resume"
              }
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-all hover:bg-secondary group-hover:opacity-100"
            >
              {uploading ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : candidate.resumeUrl ? (
                <FileCheck2 className="h-3 w-3 text-success" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => void handleResumeUpload(event)}
            />
            <button
              data-testid="kanban-ai-screen-button"
              onClick={() => onScreen(candidate)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary opacity-0 transition-all hover:bg-primary/20 group-hover:opacity-100"
            >
              <Sparkles className="h-3 w-3" /> AI screen
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MatchScore({ score }: { score: number }) {
  const tone =
    score >= 90
      ? "bg-success/15 text-success"
      : score >= 80
        ? "bg-primary/15 text-primary"
        : score >= 70
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
        tone,
      )}
      title="AI match score"
    >
      {score}
    </span>
  );
}
