import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AiUsageDashboard } from "@/components/settings/ai-usage-dashboard";
import { AiBudgetPanel } from "@/components/settings/ai-budget-panel";

export const metadata: Metadata = { title: "AI Usage & Spend" };

/**
 * Enterprise AI Gateway analytics dashboard — token consumption, cost tracking,
 * per-feature breakdown, and searchable log table with CSV export.
 *
 * Org-scoped via `getAiSpendSummary` + `listAiUsageLogs` (explicit eq + RLS).
 * Tier-aware rate limiting displayed (Trial 30, Pro 120, Enterprise 600 req/min).
 *
 * The AI Budget & Usage widget adds monthly cap governance + fallback routing
 * (enforced by the Copilot orchestrator via lib/ai/telemetry).
 */
export default function AiUsagePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Usage & Spend"
        description="Token analytics, cost observability, and tier-aware rate limiting for your AI gateway. All data is org-scoped and RLS-protected."
      />
      <AiBudgetPanel />
      <AiUsageDashboard />
    </div>
  );
}
