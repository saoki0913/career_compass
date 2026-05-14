import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";

export function CompaniesListHeaderSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" shimmerDelayMs={0} />
        <SkeletonText lines={1} widths={["8rem"]} staggerShimmerMs={40} />
      </div>
      <SkeletonButton className="h-11 w-36" shimmerDelayMs={35} />
    </div>
  );
}

type CompaniesKanbanSkeletonProps = {
  announce?: boolean;
};

export function CompaniesKanbanSkeleton({
  announce = true,
}: CompaniesKanbanSkeletonProps = {}) {
  return (
    <div
      {...(announce
        ? { role: "status", "aria-busy": true, "aria-live": "polite" as const }
        : { "aria-hidden": true })}
    >
      {announce && <span className="sr-only">企業一覧を読み込んでいます</span>}
      <ListPageFilterBarSkeleton variant="companies" />

      <div className="grid min-h-[420px] grid-cols-1 gap-3 overflow-hidden lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, columnIndex) => (
          <div key={columnIndex} className="min-h-0 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <SkeletonPill className="h-7 w-24" shimmerDelayMs={columnIndex * 35} />
              <SkeletonPill className="h-6 w-8" shimmerDelayMs={columnIndex * 35 + 15} />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, itemIndex) => (
                <div
                  key={itemIndex}
                  className="rounded-lg border border-border/60 bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <SkeletonCircle className="h-10 w-10 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30} />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-4 w-24 max-w-full rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 10} />
                        <Skeleton className="h-3 w-16 rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 20} />
                      </div>
                    </div>
                    <SkeletonButton className="h-8 w-8 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 15} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <SkeletonPill className="h-6 w-16" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 35} />
                    <SkeletonPill className="h-6 w-20" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 45} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Inner skeleton for /companies: matches header + default kanban content.
 */
export function CompaniesListContentSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">企業一覧を読み込んでいます</span>
      <CompaniesListHeaderSkeleton />
      <CompaniesKanbanSkeleton announce={false} />
    </div>
  );
}
