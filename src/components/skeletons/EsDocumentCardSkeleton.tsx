import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

/** Matches `ESCard` structure: star + title, status badge, company line, category, footer. */
export function EsDocumentCardSkeleton() {
  return (
    <div className="flex min-h-[200px] flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
          <Skeleton className="h-5 max-w-[min(100%,12rem)] flex-1 rounded-md" />
        </div>
        <SkeletonPill className="h-6 w-16 shrink-0" />
      </div>
      <Skeleton className="mb-2 h-4 w-[85%] max-w-[14rem] rounded-full" />
      <SkeletonPill className="mb-3 h-5 w-28" />
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-7 w-[6.5rem] rounded-md" />
      </div>
    </div>
  );
}
