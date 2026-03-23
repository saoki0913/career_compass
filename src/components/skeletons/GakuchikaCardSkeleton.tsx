import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

/** Matches `GakuchikaCard`: star + title, STAR badge, summary, progress strip, footer. */
export function GakuchikaCardSkeleton() {
  return (
    <div className="flex min-h-[220px] flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
          <Skeleton className="h-5 max-w-[min(100%,12rem)] flex-1 rounded-md" />
        </div>
        <SkeletonPill className="h-6 w-20 shrink-0" />
      </div>
      <SkeletonTextBlock />
      <div className="mb-3 mt-2 space-y-1.5">
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2 w-[80%] rounded-full" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
      </div>
    </div>
  );
}

function SkeletonTextBlock() {
  return (
    <div className="mb-3 space-y-2">
      <Skeleton className="h-4 w-full rounded-md" />
      <Skeleton className="h-4 w-[92%] rounded-md" />
    </div>
  );
}
