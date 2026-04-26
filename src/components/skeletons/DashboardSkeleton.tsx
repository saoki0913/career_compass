import { Fragment } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto max-w-7xl px-4 py-1 sm:px-6 lg:px-8 flex flex-col gap-1"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Greeting */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-7 w-48 max-w-full rounded-lg sm:w-64" shimmerDelayMs={0} />
            <SkeletonPill className="h-5 w-16" shimmerDelayMs={40} />
          </div>
          <SkeletonText lines={1} widths={["12rem"]} staggerShimmerMs={35} />
        </div>

        {/* Quick Actions - 5 gradient cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" shimmerDelayMs={i * 40} />
          ))}
        </div>

        {/* Middle row: Schedule + Tasks */}
        <div className="grid grid-cols-1 gap-1 lg:grid-cols-[7fr_3fr] lg:items-start">
          {/* Schedule skeleton */}
          <Card className="border-border/50 py-1.5 gap-1.5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-6 w-44 rounded-md" shimmerDelayMs={0} />
              <SkeletonButton className="h-8 w-24" shimmerDelayMs={40} />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] gap-y-1">
                <div />
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5 py-1">
                    <Skeleton className="h-3 w-4 rounded" shimmerDelayMs={i * 20} />
                    <Skeleton className="h-3 w-6 rounded" shimmerDelayMs={i * 20 + 10} />
                  </div>
                ))}
                {Array.from({ length: 2 }).map((_, row) => (
                  <Fragment key={row}>
                    <div className="flex items-start justify-center pt-1">
                      <Skeleton className="h-3 w-4 rounded" shimmerDelayMs={row * 40} />
                    </div>
                    {Array.from({ length: 7 }).map((_, col) => (
                      <div key={`cell-${row}-${col}`} className="min-h-[24px] border-t border-border/20 px-0.5 py-0.5">
                        {row === 1 && col === 2 && <Skeleton className="h-5 w-full rounded-sm" shimmerDelayMs={100} />}
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tasks skeleton */}
          <Card className="border-border/50 py-2 gap-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-6 w-28 rounded-md" shimmerDelayMs={0} />
              <SkeletonButton className="h-8 w-20" shimmerDelayMs={40} />
            </CardHeader>
            <CardContent className="space-y-1.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                  <Skeleton className="h-8 w-1 shrink-0 rounded-full" shimmerDelayMs={i * 60} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36 rounded-md" shimmerDelayMs={i * 60 + 15} />
                    <Skeleton className="h-3 w-20 rounded-md" shimmerDelayMs={i * 60 + 30} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Bottom row: CompanyProgress + Deadlines */}
        <div className="grid grid-cols-1 gap-1 lg:grid-cols-[7fr_3fr] lg:items-start">
          {/* Pipeline skeleton - 5 columns */}
          <Card className="border-border/50 py-2 gap-1.5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-6 w-24 rounded-md" shimmerDelayMs={0} />
              <SkeletonButton className="h-8 w-24" shimmerDelayMs={40} />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-7 w-full rounded-lg" shimmerDelayMs={i * 30} />
                    <div className="mt-1 space-y-1">
                      <Skeleton className="h-12 w-full rounded-md" shimmerDelayMs={i * 30 + 15} />
                      <Skeleton className="h-12 w-full rounded-md" shimmerDelayMs={i * 30 + 30} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Deadline skeleton */}
          <Card className="border-border/50 py-2 gap-1.5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-6 w-16 rounded-md" shimmerDelayMs={0} />
              <SkeletonButton className="h-8 w-20" shimmerDelayMs={40} />
            </CardHeader>
            <CardContent className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-md" shimmerDelayMs={i * 50} />
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
  );
}
