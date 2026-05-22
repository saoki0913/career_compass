import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

function DeadlinesFilterSkeleton() {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.5)] sm:mb-8 sm:p-4">
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(18rem,1.4fr)_minmax(11rem,0.7fr)_minmax(11rem,0.7fr)_auto]">
        <Skeleton className="col-span-2 h-10 rounded-xl xl:col-span-1" />
        <Skeleton className="h-10 rounded-xl" shimmerDelayMs={30} />
        <Skeleton className="h-10 rounded-xl" shimmerDelayMs={60} />
        <div className="col-span-2 flex items-center gap-2 xl:col-span-1">
          <Skeleton className="h-10 w-24 rounded-xl" shimmerDelayMs={90} />
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-hidden">
        {["5rem", "5.75rem", "6rem", "5rem", "6.5rem"].map((width, index) => (
          <Skeleton
            key={width}
            className="h-9 shrink-0 rounded-full sm:h-10"
            shimmerDelayMs={120 + index * 30}
            style={{ width }}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanColumnSkeleton({ delay }: { delay: number }) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-2 border-b-2 border-border/30 pb-2.5">
        <Skeleton className="h-4 w-12 rounded-md" shimmerDelayMs={delay} />
        <Skeleton className="h-5 w-5 rounded-full" shimmerDelayMs={delay + 15} />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)] lg:rounded-xl lg:p-3.5"
          >
            <Skeleton
              className="mb-1.5 h-3 w-20 rounded-md"
              shimmerDelayMs={delay + i * 60}
            />
            <Skeleton
              className="mb-2 h-4 w-full rounded-md"
              shimmerDelayMs={delay + i * 60 + 20}
            />
            <div className="mb-2 flex items-center justify-between gap-2">
              <Skeleton
                className="h-5 w-16 rounded-full"
                shimmerDelayMs={delay + i * 60 + 30}
              />
              <Skeleton
                className="h-3 w-12 rounded-md"
                shimmerDelayMs={delay + i * 60 + 40}
              />
            </div>
            <Skeleton
              className="mb-2 h-3 w-16 rounded-md"
              shimmerDelayMs={delay + i * 60 + 50}
            />
            <div className="flex items-center gap-2">
              <Skeleton className="h-1.5 flex-1 rounded-full bg-sky-100" shimmerDelayMs={delay + i * 60 + 55} />
              <Skeleton className="h-3 w-8 rounded-md" shimmerDelayMs={delay + i * 60 + 60} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeadlinesDashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 xl:grid-cols-4 xl:gap-6">
        <KanbanColumnSkeleton delay={0} />
        <KanbanColumnSkeleton delay={80} />
        <KanbanColumnSkeleton delay={160} />
        <KanbanColumnSkeleton delay={240} />
      </div>
    </div>
  );
}

/**
 * Full page skeleton used in the loading.tsx file.
 * Includes heading, filter bar placeholder, and kanban columns.
 */
export function DeadlinesDashboardPageSkeleton() {
  return (
    <div className="mx-auto max-w-[92rem] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-6 sm:px-8 sm:py-10 lg:px-10 xl:px-12">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <SkeletonText lines={1} widths={["14rem"]} className="hidden sm:block" />
      </div>

      <DeadlinesFilterSkeleton />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 xl:grid-cols-4 xl:gap-6">
        <KanbanColumnSkeleton delay={0} />
        <KanbanColumnSkeleton delay={80} />
        <KanbanColumnSkeleton delay={160} />
        <KanbanColumnSkeleton delay={240} />
      </div>
    </div>
  );
}
