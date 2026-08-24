import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state (Pro Max #2/#3: loading feedback + reserve space
 * to avoid layout shift). Rendered during navigation.
 */
export default function Loading() {
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
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
