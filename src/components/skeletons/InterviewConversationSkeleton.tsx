import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

import {
  ConversationWorkspaceShellSkeleton,
  SidebarCardSkeleton,
} from "./ConversationWorkspaceShellSkeleton";

/**
 * Interview conversation page skeleton (`/companies/[id]/interview`).
 *
 * Delegates structural layout to `ConversationWorkspaceShellSkeleton` and
 * provides Interview-specific sidebar cards: progress, settings, materials,
 * and feedback.
 */
export function InterviewConversationSkeleton({
  accent = "面接の流れを整えています",
}: {
  accent?: string;
}) {
  return (
    <ConversationWorkspaceShellSkeleton
      accent={accent}
      actionBarSkeleton={
        <div className="w-full rounded-xl border border-border/50 bg-card px-4 py-3">
          <Skeleton className="h-4 w-56 rounded-lg" shimmerDelayMs={45} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <SkeletonPill className="h-8 w-20" shimmerDelayMs={60} />
              <SkeletonPill className="h-8 w-24" shimmerDelayMs={75} />
            </div>
            <SkeletonButton
              className="h-10 w-32 rounded-xl"
              shimmerDelayMs={90}
            />
          </div>
        </div>
      }
      mobileStatusSkeleton={
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonPill className="h-5 w-16" shimmerDelayMs={0} />
          <SkeletonPill className="h-5 w-20" shimmerDelayMs={15} />
        </div>
      }
      sidebarSkeleton={
        <>
          {/* Card 1: Progress */}
          <SidebarCardSkeleton headerWidth="w-16" shimmerBase={0}>
            <div className="space-y-3">
              <SkeletonButton
                className="h-9 w-full rounded-lg"
                shimmerDelayMs={15}
              />
              <SkeletonText
                lines={3}
                widths={["100%", "80%", "60%"]}
                staggerShimmerMs={20}
              />
            </div>
          </SidebarCardSkeleton>

          {/* Card 2: Settings */}
          <SidebarCardSkeleton headerWidth="w-14" shimmerBase={60}>
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-3.5 w-3/4 rounded-md"
                  shimmerDelayMs={75 + i * 15}
                />
              ))}
            </div>
          </SidebarCardSkeleton>

          {/* Card 3: Materials */}
          <SidebarCardSkeleton headerWidth="w-12" shimmerBase={120}>
            <div className="space-y-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton
                    className="h-4 w-4 shrink-0 rounded"
                    shimmerDelayMs={135 + i * 20}
                  />
                  <Skeleton
                    className="h-3.5 w-3/5 rounded-md"
                    shimmerDelayMs={150 + i * 20}
                  />
                </div>
              ))}
            </div>
          </SidebarCardSkeleton>

          {/* Card 4: Feedback */}
          <SidebarCardSkeleton headerWidth="w-20" shimmerBase={180}>
            <div className="space-y-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton
                    className="h-4 w-4 shrink-0 rounded"
                    shimmerDelayMs={195 + i * 20}
                  />
                  <Skeleton
                    className="h-3.5 w-2/3 rounded-md"
                    shimmerDelayMs={210 + i * 20}
                  />
                </div>
              ))}
            </div>
          </SidebarCardSkeleton>
        </>
      }
    />
  );
}
