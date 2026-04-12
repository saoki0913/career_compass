import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

function StatCardSkeleton({ delay }: { delay: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-lg" shimmerDelayMs={delay} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-12 rounded-md" shimmerDelayMs={delay + 20} />
        <Skeleton className="h-5 w-10 rounded-md" shimmerDelayMs={delay + 40} />
      </div>
    </div>
  );
}

function KanbanColumnSkeleton({ delay }: { delay: number }) {
  return (
    <div className="flex flex-col">
      {/* Column header */}
      <div className="mb-3 flex items-center gap-2 border-b-2 border-border/30 pb-2">
        <Skeleton className="h-4 w-12 rounded-md" shimmerDelayMs={delay} />
        <Skeleton className="h-5 w-5 rounded-full" shimmerDelayMs={delay + 15} />
      </div>

      {/* Card skeletons */}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 bg-card p-3.5 shadow-sm"
          >
            {/* Company */}
            <Skeleton
              className="mb-1.5 h-3 w-20 rounded-md"
              shimmerDelayMs={delay + i * 60}
            />
            {/* Title */}
            <Skeleton
              className="mb-2 h-4 w-full rounded-md"
              shimmerDelayMs={delay + i * 60 + 20}
            />
            {/* Badge + days left */}
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
            {/* Due date */}
            <Skeleton
              className="mb-2 h-3 w-16 rounded-md"
              shimmerDelayMs={delay + i * 60 + 50}
            />
            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-1.5 flex-1 rounded-full" shimmerDelayMs={delay + i * 60 + 55} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
 * Includes stat cards, filter bar placeholders, and kanban columns.
 */
export function DeadlinesDashboardPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <SkeletonText lines={1} widths={["14rem"]} />
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} delay={i * 30} />
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full rounded-md sm:max-w-xs" shimmerDelayMs={10} />
          <Skeleton className="h-9 w-36 rounded-md" shimmerDelayMs={30} />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" shimmerDelayMs={50} />
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KanbanColumnSkeleton delay={0} />
        <KanbanColumnSkeleton delay={80} />
        <KanbanColumnSkeleton delay={160} />
        <KanbanColumnSkeleton delay={240} />
      </div>
    </div>
  );
}
