import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
} from "@/components/ui/skeleton";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

function TaskGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5 xl:gap-4">
      {Array.from({ length: 5 }).map((_, colIndex) => (
        <div key={colIndex} className="space-y-2">
          <div className="flex items-center justify-between border-b-2 border-muted pb-3">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-4 w-5 rounded-full" />
          </div>
          {Array.from({ length: colIndex < 2 ? 2 : 1 }).map(
            (_, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-xl border border-border/60 bg-background p-4 shadow-sm xl:p-3"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
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
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <section key={sectionIndex}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-md" />
              <SkeletonPill className="h-6 w-8" />
            </div>
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: sectionIndex === 0 ? 2 : 1 }).map(
              (_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="flex items-start gap-2.5 rounded-2xl border border-border/60 bg-background p-3.5 shadow-sm md:gap-4 md:p-4"
                >
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <SkeletonPill className="h-6 w-16" />
                      <Skeleton className="h-4 w-24 rounded-md" />
                    </div>
                    <Skeleton className="h-5 w-full max-w-[18rem] rounded-md" />
                    <Skeleton className="h-4 w-32 rounded-md" />
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TasksPageSkeleton({ embedded = false }: { embedded?: boolean }) {
  if (embedded) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">タスクを読み込んでいます</span>
        <div className="md:hidden">
          <TaskListSkeleton />
        </div>
        <div className="hidden md:block">
          <TaskGridSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-[1600px] px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-10"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">タスクを読み込んでいます</span>
      <ProductPageHeaderSkeleton actionCount={2} showBackLink />

      <ListPageFilterBarSkeleton variant="tasks" />

      <div className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent px-4 py-3 shadow-sm md:px-5 md:py-2">
        <div className="flex min-h-[72px] flex-col gap-3 md:min-h-[56px] md:flex-row md:items-center">
          <SkeletonCircle className="h-4 w-4" />
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="hidden h-4 w-px bg-border/50 sm:block" />
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-48 flex-1 rounded-md" />
          <SkeletonButton className="h-8 w-12 shrink-0" />
        </div>
      </div>

      <TaskGridSkeleton />
    </div>
  );
}
