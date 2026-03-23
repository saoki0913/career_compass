import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";

/**
 * Inner skeleton for /companies: matches ListPageFilterBar + company grid cards.
 */
export function CompaniesListContentSkeleton() {
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" shimmerDelayMs={0} />
          <SkeletonText lines={1} widths={["8rem"]} staggerShimmerMs={40} />
        </div>
        <SkeletonButton className="h-11 w-36" shimmerDelayMs={35} />
      </div>

      <ListPageFilterBarSkeleton variant="companies" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <SkeletonCircle className="h-12 w-12 rounded-2xl" shimmerDelayMs={i * 45} />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28 rounded-full" shimmerDelayMs={i * 45 + 20} />
                  <Skeleton className="h-3 w-16 rounded-full" shimmerDelayMs={i * 45 + 35} />
                </div>
              </div>
              <SkeletonButton className="h-9 w-9 rounded-2xl" shimmerDelayMs={i * 45 + 15} />
            </div>
            <SkeletonText
              className="mt-4"
              lines={3}
              widths={["100%", "86%", "64%"]}
              staggerShimmerMs={50}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <SkeletonPill className="h-8 w-20" shimmerDelayMs={i * 45 + 120} />
              <SkeletonPill className="h-8 w-24" shimmerDelayMs={i * 45 + 140} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
