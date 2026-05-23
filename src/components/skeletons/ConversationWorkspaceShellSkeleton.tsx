import type { ReactNode } from "react";

import {
  PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
} from "@/components/shared/product-page-header-layout";
import {
  Skeleton,
  SkeletonButton,
  SkeletonText,
} from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ConversationWorkspaceShellSkeletonProps {
  accent?: string;
  sidebarSkeleton?: ReactNode;
  actionBarSkeleton?: ReactNode;
  mobileStatusSkeleton?: ReactNode;
}

/**
 * Shared loading skeleton that mirrors `ConversationWorkspaceShell` layout.
 *
 * Every Tailwind class on structural wrappers is copied verbatim from
 * `src/components/chat/ConversationWorkspaceShell.tsx` so that the skeleton
 * occupies the same visual footprint and avoids layout shift on hydration.
 *
 * Feature-specific content (sidebar cards, action bar, mobile status) is
 * injected via props so Motivation / Interview / Gakuchika each get a
 * tailored placeholder without duplicating the shell grid.
 */
export function ConversationWorkspaceShellSkeleton({
  accent,
  sidebarSkeleton,
  actionBarSkeleton,
  mobileStatusSkeleton,
}: ConversationWorkspaceShellSkeletonProps) {
  return (
    <div
      className="h-screen bg-background flex flex-col overflow-hidden"
      role="status"
      aria-label={accent}
      aria-busy="true"
      aria-live="polite"
    >
      <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-8">
        {/* ---- Header ---- */}
        <div className={cn("mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between", PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET)}>
          {/* Left: back button + title + subtitle */}
          <div className="flex min-w-0 items-start gap-3">
            <Skeleton
              className="h-11 w-11 shrink-0 rounded-xl"
              shimmerDelayMs={0}
            />
            <div className="min-w-0 pt-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-7 w-40 rounded-lg sm:h-8" shimmerDelayMs={15} />
                <div className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30 lg:block" />
                <Skeleton
                  className="hidden h-4 w-48 rounded-lg lg:block"
                  shimmerDelayMs={30}
                />
              </div>
              <Skeleton className="mt-1 h-4 w-44 rounded-lg lg:hidden" shimmerDelayMs={30} />
            </div>
          </div>

          {/* Right: optional action bar */}
          <div className="flex w-full flex-col gap-2 xl:max-w-[820px] xl:items-end">
            {actionBarSkeleton}
          </div>
        </div>

        {/* ---- Content grid ---- */}
        <div className="grid grid-cols-1 gap-3.5 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.7fr)] 2xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,0.65fr)]">
          {/* Left column -- chat panel */}
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
            {/* Mobile status (hidden on xl+) */}
            {mobileStatusSkeleton ? (
              <div className="border-b border-border/50 px-3 py-3 sm:px-4 xl:hidden">
                {mobileStatusSkeleton}
              </div>
            ) : null}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-3 pt-3 sm:px-4 sm:pt-4 xl:pb-4">
              <div className="mx-auto max-w-3xl space-y-4">
                {/* User message (right-aligned) */}
                <div className="flex justify-end">
                  <div className="w-[72%] rounded-2xl bg-muted/30 p-4">
                    <SkeletonText
                      lines={2}
                      widths={["100%", "55%"]}
                      staggerShimmerMs={15}
                    />
                  </div>
                </div>
                {/* AI message (left-aligned) */}
                <div className="flex justify-start">
                  <div className="w-[85%] rounded-2xl bg-muted/30 p-4">
                    <SkeletonText
                      lines={3}
                      widths={["92%", "100%", "48%"]}
                      staggerShimmerMs={15}
                    />
                  </div>
                </div>
                {/* User message (right-aligned) */}
                <div className="flex justify-end">
                  <div className="w-[65%] rounded-2xl bg-muted/30 p-4">
                    <SkeletonText
                      lines={2}
                      widths={["100%", "40%"]}
                      staggerShimmerMs={15}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-xl:pb-3 xl:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <div className="flex items-end gap-2 rounded-xl border border-border/70 bg-card p-3">
                <Skeleton
                  className="min-h-[3rem] flex-1 rounded-lg"
                  shimmerDelayMs={60}
                />
                <SkeletonButton
                  className="h-10 w-10 shrink-0 rounded-lg"
                  shimmerDelayMs={75}
                />
              </div>
            </div>
          </div>

          {/* Right column -- sidebar (desktop only) */}
          <div className="hidden space-y-3 xl:flex xl:min-h-0 xl:flex-col xl:space-y-0">
            <div className="space-y-3 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {sidebarSkeleton}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar card skeleton -- mirrors ConversationSidebarCard shape     */
/* ------------------------------------------------------------------ */

export function SidebarCardSkeleton({
  headerWidth = "w-20",
  headerAction,
  children,
  shimmerBase = 0,
}: {
  headerWidth?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  shimmerBase?: number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5">
        <Skeleton
          className={`h-4 ${headerWidth} rounded-lg`}
          shimmerDelayMs={shimmerBase}
        />
        {headerAction}
      </div>
      <div className="px-3.5 pb-3.5 pt-0">{children}</div>
    </div>
  );
}
