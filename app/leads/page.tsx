import type { Metadata } from "next";
import { getDeals, getLeads } from "@/lib/api";
import { LeadPipeline } from "@/components/leads/lead-pipeline";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Lead Intelligence",
};

export default async function LeadsPage() {
  const leads = await getLeads();
  const deals = await getDeals();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Intelligence"
        description="AI-scored leads and your sales pipeline at a glance."
      />
      <LeadPipeline leads={leads} deals={deals} />
    </div>
  );
}
