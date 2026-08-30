import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared dashboard loading skeleton — reserved-space layout that mirrors the
 * page shell (header → stat cards → table) so route transitions never flash
 * or shift. Reused by the root `loading.tsx`, the `(dashboard)` route group,
 * and standalone module routes.
 */
export function DashboardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="glass rounded-xl p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="glass rounded-xl p-6">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
