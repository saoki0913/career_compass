import {
  Skeleton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

import {
  ConversationWorkspaceShellSkeleton,
  SidebarCardSkeleton,
} from "./ConversationWorkspaceShellSkeleton";

/**
 * Motivation conversation page skeleton (`/companies/[id]/motivation`).
 *
 * Delegates structural layout to `ConversationWorkspaceShellSkeleton` and
 * provides Motivation-specific sidebar cards: progress + company info.
 */
export function ConversationPageSkeleton({
  accent = "企業情報を読み込んでいます",
}: {
  accent?: string;
}) {
  return (
    <ConversationWorkspaceShellSkeleton
      accent={accent}
      mobileStatusSkeleton={
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonPill className="h-5 w-16" shimmerDelayMs={0} />
          <SkeletonPill className="h-5 w-12" shimmerDelayMs={15} />
          <SkeletonPill className="h-5 w-20" shimmerDelayMs={30} />
        </div>
      }
      sidebarSkeleton={
        <>
          {/* Card 1: Progress */}
          <SidebarCardSkeleton headerWidth="w-12" shimmerBase={0}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <SkeletonPill className="h-5 w-16" shimmerDelayMs={15} />
                <SkeletonPill className="h-5 w-14" shimmerDelayMs={30} />
                <SkeletonPill className="h-5 w-18" shimmerDelayMs={45} />
              </div>
              <SkeletonText
                lines={3}
                widths={["100%", "88%", "64%"]}
                staggerShimmerMs={20}
              />
            </div>
          </SidebarCardSkeleton>

          {/* Card 2: Company info / evidence */}
          <SidebarCardSkeleton headerWidth="w-20" shimmerBase={60}>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonCircle
                    className="h-6 w-6 shrink-0"
                    shimmerDelayMs={75 + i * 20}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton
                      className="h-3.5 w-3/4 rounded-md"
                      shimmerDelayMs={85 + i * 20}
                    />
                    <Skeleton
                      className="h-3 w-1/2 rounded-md"
                      shimmerDelayMs={95 + i * 20}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SidebarCardSkeleton>
        </>
      }
    />
  );
}
