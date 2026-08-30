import { DashboardSkeleton } from "@/components/layout/dashboard-skeleton";

/**
 * Route-level loading state for the AI Copilot — keeps the transition
 * instant and layout-stable while the page's client bundle hydrates.
 */
export default function Loading() {
  return <DashboardSkeleton rows={6} />;
}
