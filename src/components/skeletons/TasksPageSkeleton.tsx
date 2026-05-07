import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
} from "@/components/ui/skeleton";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";

export function TasksPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-4 w-80 max-w-full rounded-md" />
        </div>
        <div className="flex gap-2">
          <SkeletonButton className="h-9 w-28" />
          <SkeletonButton className="h-9 w-28" />
        </div>
      </div>

      <ListPageFilterBarSkeleton variant="tasks" />

      {/* Priority card skeleton - compact single row */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent px-4 py-2 shadow-sm">
        <div className="flex min-h-[44px] items-center gap-3">
          <SkeletonCircle className="h-4 w-4" />
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="hidden h-4 w-px bg-border/50 sm:block" />
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-48 flex-1 rounded-md" />
          <SkeletonButton className="h-8 w-12 shrink-0" />
        </div>
      </div>

      {/* Kanban 5-column grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, colIndex) => (
          <div key={colIndex} className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-4 w-5 rounded-full" />
            </div>
            {Array.from({ length: colIndex < 2 ? 2 : 1 }).map(
              (_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="rounded-xl border border-border/60 bg-background p-3 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonPill className="h-5 w-14" />
                      <Skeleton className="h-4 w-full max-w-[10rem] rounded-md" />
                      <Skeleton className="h-3 w-24 rounded-md" />
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
