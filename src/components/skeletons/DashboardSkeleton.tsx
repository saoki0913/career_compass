import { Fragment } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonButton, SkeletonPill } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="bg-background">
      <div
        className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:h-dvh lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:px-5 lg:py-3"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Greeting + inline QA pills */}
        <div className="flex min-h-9 items-center gap-3">
          <Skeleton className="h-6 w-48 max-w-full rounded-lg" shimmerDelayMs={0} />
          <Skeleton className="h-4 w-36 rounded hidden lg:block" shimmerDelayMs={40} />
          <div className="ml-auto hidden lg:flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-lg" shimmerDelayMs={i * 30} />
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:gap-2 lg:overflow-hidden">
          {/* Left column */}
          <div className="flex min-h-0 flex-col gap-3 lg:grid lg:grid-rows-[minmax(0,1.42fr)_minmax(0,1fr)] lg:gap-2 lg:overflow-hidden">
            {/* Schedule skeleton */}
            <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
                <Skeleton className="h-6 w-44 rounded-md" shimmerDelayMs={0} />
                <div className="flex items-center gap-1">
                  <Skeleton className="h-7 w-7 rounded-md" shimmerDelayMs={20} />
                  <Skeleton className="h-7 w-10 rounded-md" shimmerDelayMs={30} />
                  <Skeleton className="h-7 w-7 rounded-md" shimmerDelayMs={40} />
                  <SkeletonButton className="h-7 w-20" shimmerDelayMs={50} />
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
                <div className="grid h-full grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(10,minmax(0,1fr))]">
                  <div />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5 py-1">
                      <Skeleton className="h-3 w-4 rounded" shimmerDelayMs={i * 20} />
                      <Skeleton className="h-3 w-6 rounded" shimmerDelayMs={i * 20 + 10} />
                    </div>
                  ))}
                  {Array.from({ length: 4 }).map((_, row) => (
                    <Fragment key={row}>
                      <div className="flex items-start justify-center pt-1">
                        <Skeleton className="h-3 w-4 rounded" shimmerDelayMs={row * 40} />
                      </div>
                      {Array.from({ length: 7 }).map((_, col) => (
                        <div key={`cell-${row}-${col}`} className="min-h-0 border-t border-border/20 px-0.5 py-0.5">
                          {row === 1 && col === 2 && <Skeleton className="h-5 w-full rounded-sm" shimmerDelayMs={100} />}
                        </div>
                      ))}
                    </Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline skeleton - 5 columns */}
            <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
                <Skeleton className="h-6 w-24 rounded-md" shimmerDelayMs={0} />
                <SkeletonButton className="h-8 w-24" shimmerDelayMs={40} />
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
                <div className="grid h-full grid-cols-5 gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-7 w-full rounded-lg" shimmerDelayMs={i * 30} />
                      <div className="mt-1 space-y-0.5">
                        <Skeleton className="h-10 w-full rounded-md" shimmerDelayMs={i * 30 + 15} />
                        <Skeleton className="h-10 w-full rounded-md" shimmerDelayMs={i * 30 + 30} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex min-h-0 flex-col gap-3 lg:grid lg:grid-rows-[minmax(0,1fr)_minmax(0,0.72fr)] lg:gap-2 lg:overflow-hidden">
            {/* Tasks skeleton */}
            <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
                <Skeleton className="h-6 w-28 rounded-md" shimmerDelayMs={0} />
                <SkeletonButton className="h-8 w-20" shimmerDelayMs={40} />
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-1.5 overflow-hidden px-4 lg:px-5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                    <Skeleton className="h-6 w-1 shrink-0 rounded-full" shimmerDelayMs={i * 60} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-36 rounded-md" shimmerDelayMs={i * 60 + 15} />
                      <Skeleton className="h-3 w-20 rounded-md" shimmerDelayMs={i * 60 + 30} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Deadline skeleton */}
            <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
                <Skeleton className="h-6 w-16 rounded-md" shimmerDelayMs={0} />
                <SkeletonButton className="h-8 w-20" shimmerDelayMs={40} />
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-1 overflow-hidden px-4 lg:px-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-0.5">
                    <Skeleton className="h-6 w-6 shrink-0 rounded-md" shimmerDelayMs={i * 50} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Skeleton className="h-3 w-24 rounded-md" shimmerDelayMs={i * 50 + 15} />
                      <Skeleton className="h-3 w-32 rounded-md" shimmerDelayMs={i * 50 + 30} />
                    </div>
                    <SkeletonPill className="h-4 w-10" shimmerDelayMs={i * 50 + 40} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
