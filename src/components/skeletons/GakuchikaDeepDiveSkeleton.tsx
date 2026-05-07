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
 * Gakuchika deep-dive conversation skeleton (`/gakuchika/[id]`).
 *
 * Delegates structural layout to `ConversationWorkspaceShellSkeleton` and
 * provides Gakuchika-specific sidebar cards: progress, session history,
 * and notes.
 */
export function GakuchikaDeepDiveSkeleton({
  accent = "ガクチカ作成の会話を読み込んでいます",
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
          <SkeletonPill className="h-5 w-12" shimmerDelayMs={15} />
          <SkeletonPill className="h-5 w-10" shimmerDelayMs={30} />
        </div>
      }
      sidebarSkeleton={
        <>
          {/* Card 1: Progress */}
          <SidebarCardSkeleton
            headerWidth="w-16"
            shimmerBase={0}
            headerAction={
              <div className="flex gap-2">
                <SkeletonButton
                  className="h-8 w-20 rounded-xl"
                  shimmerDelayMs={15}
                />
                <SkeletonButton
                  className="h-8 w-24 rounded-xl"
                  shimmerDelayMs={30}
                />
              </div>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <SkeletonPill className="h-6 w-14" shimmerDelayMs={45} />
                <SkeletonPill className="h-6 w-20" shimmerDelayMs={60} />
              </div>
              <SkeletonText
                lines={3}
                widths={["100%", "92%", "66%"]}
                staggerShimmerMs={20}
              />
            </div>
          </SidebarCardSkeleton>

          {/* Card 2: Session history */}
          <SidebarCardSkeleton headerWidth="w-24" shimmerBase={90}>
            <div className="space-y-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonButton
                  key={i}
                  className="h-10 w-full rounded-lg"
                  shimmerDelayMs={105 + i * 20}
                />
              ))}
            </div>
          </SidebarCardSkeleton>

          {/* Card 3: Notes */}
          <SidebarCardSkeleton headerWidth="w-14" shimmerBase={150}>
            <div className="space-y-2">
              <Skeleton
                className="h-4 w-2/3 rounded-md"
                shimmerDelayMs={165}
              />
              <SkeletonText
                lines={2}
                widths={["100%", "76%"]}
                staggerShimmerMs={15}
              />
            </div>
          </SidebarCardSkeleton>
        </>
      }
    />
  );
}
