import { ES_CARD_CONTENT_CLASS, ES_CARD_SKELETON_CLASS } from "@/components/es/es-list-layout";
import { Skeleton, SkeletonPill } from "@/components/ui/skeleton";

/** Matches `ESCard` structure: star + title, status badge, company line, category, footer. */
export function EsDocumentCardSkeleton() {
  return (
    <div className={ES_CARD_SKELETON_CLASS}>
      <div className={ES_CARD_CONTENT_CLASS}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <Skeleton className="mt-1 h-5 max-w-[min(100%,12rem)] flex-1 rounded-md" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        </div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-[45%] max-w-[9rem] rounded-full" />
          <SkeletonPill className="h-6 w-16 shrink-0" />
        </div>
        <SkeletonPill className="mb-1.5 h-5 w-28" />
        <div className="mt-auto flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-8 w-[6.75rem] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
