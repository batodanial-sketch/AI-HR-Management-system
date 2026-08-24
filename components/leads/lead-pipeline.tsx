"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Download, Lock, Target } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFeatureAccess } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { Deal, Lead, LeadStatus } from "@/lib/types";

const STAGES: Array<{ id: LeadStatus; label: string }> = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

function scoreTone(score: number): string {
  if (score >= 85) return "bg-success/15 text-success";
  if (score >= 70) return "bg-primary/15 text-primary";
  if (score >= 50) return "bg-warning/15 text-warning";
  return "bg-muted text-muted-foreground";
}

function exportLeadsCsv(leads: Lead[]): void {
  const header = "first_name,last_name,email,company,title,source,status,score";
  const rows = leads.map((lead) =>
    [
      lead.firstName,
      lead.lastName,
      lead.email,
      lead.company,
      lead.title,
      lead.source,
      lead.status,
      String(lead.score),
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fluxentiq-leads.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Lead intelligence pipeline. A six-column board of AI-scored leads; the
 * associated deals (with value + probability) are summarized in a header strip.
 */
export function LeadPipeline({
  leads,
  deals,
}: {
  leads: Lead[];
  deals: Deal[];
}) {
  const canExport = useFeatureAccess("leads_export");
  const totalPipeline = deals
    .filter((deal) => deal.stage !== "closed_lost" && deal.stage !== "closed_won")
    .reduce((sum, deal) => sum + deal.value, 0);

  return (
    <div className="space-y-4">
      {/* Pipeline summary + export toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Open leads" value={leads.length.toString()} />
          <SummaryCard
            label="Pipeline value"
            value={`$${totalPipeline.toLocaleString()}`}
          />
          <SummaryCard
            label="Avg. lead score"
            value={Math.round(
              leads.reduce((sum, lead) => sum + lead.score, 0) /
                Math.max(leads.length, 1),
            ).toString()}
          />
        </div>

        {canExport ? (
          <Button
            variant="outline"
            data-testid="leads-export-csv-btn"
            onClick={() => exportLeadsCsv(leads)}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" data-testid="leads-export-csv-btn" disabled>
                <Lock className="h-4 w-4" /> Export CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pro Feature</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Pipeline board */}
      <div
        data-testid="lead-pipeline"
        className="flex gap-4 overflow-x-auto pb-4 [scroll-snap-type:x_mandatory]"
      >
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.status === stage.id);
          return (
            <div
              key={stage.id}
              data-stage={stage.id}
              className="flex min-w-[260px] flex-1 snap-start flex-col rounded-xl border border-border/70 bg-card/40 p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{stage.label}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {stageLeads.length}
                </span>
              </div>

              <div className="flex min-h-24 flex-col gap-2.5">
                {stageLeads.map((lead) => (
                  <motion.div
                    key={lead.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group rounded-lg border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <NameAvatar
                          name={`${lead.firstName} ${lead.lastName}`}
                          className="h-8 w-8"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {lead.firstName} {lead.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {lead.company}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
                          scoreTone(lead.score),
                        )}
                      >
                        {lead.score}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {lead.source}
                      </span>
                      <Target className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </motion.div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
                    No leads
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deals table */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Open deals</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Deal</th>
                <th className="px-5 py-3 font-medium">Value</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 text-right font-medium">Probability</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{deal.name}</td>
                  <td className="px-5 py-3 tabular-nums">
                    ${deal.value.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="secondary">{deal.stage.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {deal.probability}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <p className="label-xs">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
