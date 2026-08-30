import { DashboardSkeleton } from "@/components/layout/dashboard-skeleton";

/**
 * Route-group loading state for every page under `app/(dashboard)/`
 * (benefits, equity, expenses, surveys, planning, contractors, offboarding,
 * assets, documents, screening, workflows, settings, …).
 *
 * Next.js renders the nearest `loading.tsx` as an instant static fallback
 * during navigation, so repeated clicks never freeze the router and every
 * transition reserves its final layout space (no layout shift).
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
