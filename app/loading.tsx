import { DashboardSkeleton } from "@/components/layout/dashboard-skeleton";

/**
 * Root route-level loading state (Pro Max #2/#3: loading feedback + reserve
 * space to avoid layout shift). Rendered during navigation for every route
 * that has no closer `loading.tsx` (the `(dashboard)` group and module pages
 * supply their own via the shared skeleton).
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
