import type { Metadata } from "next";
import { getDashboardMetrics } from "@/lib/api";
import { recentActivity } from "@/lib/data";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { PageHeader } from "@/components/layout/page-header";
import { StatusOrbClient } from "@/components/three/status-orb-client";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Executive Dashboard"
          description="A live overview of your workforce, spend, and hiring pipeline."
        />
        {/* Live 3D status orb — theme-reactive, lazy-loaded, WebGL-safe fallback */}
        <StatusOrbClient size={96} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <KpiCard key={metric.key} metric={metric} index={index} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity events={recentActivity} />
        </div>
        <QuickActions />
      </section>
    </div>
  );
}
