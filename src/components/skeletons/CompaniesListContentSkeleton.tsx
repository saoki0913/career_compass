import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
} from "@/components/ui/skeleton";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

export function CompaniesListHeaderSkeleton() {
  return <ProductPageHeaderSkeleton actionCount={1} showBackLink showMobilePrimaryAction />;
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

      <div className="grid min-h-[420px] grid-cols-1 gap-3 overflow-hidden md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, columnIndex) => (
          <div key={columnIndex} className="min-h-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-2 shadow-sm md:min-h-[30rem] xl:min-h-[36rem]">
            <div className="flex h-10 items-center justify-between gap-2 rounded-xl bg-muted px-4 sm:h-11 lg:h-10 lg:px-3">
              <SkeletonPill className="h-6 w-24" shimmerDelayMs={columnIndex * 35} />
              <SkeletonPill className="h-6 w-8" shimmerDelayMs={columnIndex * 35 + 15} />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, itemIndex) => (
                <div
                  key={itemIndex}
                  className="rounded-xl border border-border/60 bg-background"
                >
                  <div className="p-3 md:hidden">
                    <div className="flex min-w-0 items-start gap-3">
                      <SkeletonCircle className="h-12 w-12 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30} />
                      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                        <Skeleton className="h-5 w-36 max-w-full rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 10} />
                        <Skeleton className="h-5 w-24 rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 20} />
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <SkeletonButton className="h-11 w-11 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 15} />
                        <SkeletonButton className="h-11 w-11 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 25} />
                      </div>
                    </div>
                    <SkeletonPill className="mt-3 h-9 w-full rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 35} />
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="flex gap-2">
                        <SkeletonPill className="h-9 w-16 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 45} />
                        <SkeletonPill className="h-9 w-16 rounded-xl" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 55} />
                      </div>
                      <Skeleton className="h-3 w-14 rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 60} />
                    </div>
                  </div>
                  <div className="hidden p-3 md:block">
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
                  <div className="hidden border-t border-border/60 px-3 py-2 md:block">
                    <Skeleton className="h-3 w-24 rounded-full" shimmerDelayMs={columnIndex * 35 + itemIndex * 30 + 60} />
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
