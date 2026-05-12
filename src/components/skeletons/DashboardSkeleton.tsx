import { Fragment } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonButton } from "@/components/ui/skeleton";

export function DashboardScheduleSkeleton() {
  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
        <Skeleton className="h-6 w-44 rounded-md" shimmerDelayMs={0} />
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-md lg:h-7 lg:w-7" shimmerDelayMs={20} />
          <Skeleton className="h-9 w-10 rounded-md lg:h-7" shimmerDelayMs={30} />
          <Skeleton className="h-9 w-9 rounded-md lg:h-7 lg:w-7" shimmerDelayMs={40} />
          <SkeletonButton className="h-9 w-20 lg:h-7" shimmerDelayMs={50} />
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
  );
}

export function DashboardCompanyListSkeleton() {
  return (
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
                <Skeleton className="h-11 w-full rounded-lg" shimmerDelayMs={i * 30 + 15} />
                <Skeleton className="h-11 w-full rounded-lg" shimmerDelayMs={i * 30 + 30} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTodayTasksSkeleton() {
  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
        <Skeleton className="h-5 w-28 rounded-md" shimmerDelayMs={0} />
        <Skeleton className="h-4 w-12 rounded" shimmerDelayMs={40} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 lg:px-5">
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section} className="space-y-1">
            <div className="flex items-center gap-2 pt-2 pb-1">
              <Skeleton className="h-3 w-10 rounded" shimmerDelayMs={section * 80} />
              <Skeleton className="h-3 w-4 rounded" shimmerDelayMs={section * 80 + 10} />
              <div className="h-px flex-1 bg-border/30" />
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 lg:min-h-0">
                <Skeleton className="h-[18px] w-[18px] shrink-0 rounded" shimmerDelayMs={section * 80 + i * 40 + 30} />
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-32 rounded-md" shimmerDelayMs={section * 80 + i * 40 + 40} />
                  <Skeleton className="h-3 w-20 rounded-md" shimmerDelayMs={section * 80 + i * 40 + 50} />
                </div>
                <Skeleton className="h-3 w-14 rounded" shimmerDelayMs={section * 80 + i * 40 + 60} />
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardDeadlinesSkeleton() {
  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 lg:px-5">
        <Skeleton className="h-5 w-14 rounded-md" shimmerDelayMs={0} />
        <Skeleton className="h-4 w-16 rounded" shimmerDelayMs={40} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-1 overflow-hidden px-4 lg:px-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex min-h-8 items-center gap-2.5 rounded-lg px-3 py-1.5">
            <Skeleton className="h-4 w-10 shrink-0 rounded" shimmerDelayMs={i * 40} />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-3.5 w-28 rounded-md" shimmerDelayMs={i * 40 + 10} />
              <Skeleton className="h-3 w-20 rounded-md" shimmerDelayMs={i * 40 + 20} />
            </div>
            <Skeleton className="h-3 w-12 rounded" shimmerDelayMs={i * 40 + 30} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="bg-background">
      <div
        className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 px-4 pb-3 pt-14 sm:px-6 lg:h-dvh lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:px-5 lg:py-3"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Greeting + quick action rail */}
        <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <Skeleton className="h-6 w-48 max-w-full rounded-lg lg:min-w-0 lg:shrink" shimmerDelayMs={0} />
          <Skeleton className="hidden h-4 w-36 shrink-0 rounded 2xl:block" shimmerDelayMs={40} />
          <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-hidden px-4 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:ml-auto lg:mr-0 lg:min-w-0 lg:flex-1 lg:justify-end lg:px-0 lg:pb-1 xl:overflow-visible xl:pb-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-22 rounded-lg lg:h-9" shimmerDelayMs={i * 30} />
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:gap-2 lg:overflow-hidden">
          {/* Left column */}
          <div className="flex min-h-0 flex-col gap-3 lg:grid lg:grid-rows-[minmax(0,1.42fr)_minmax(0,1fr)] lg:gap-2 lg:overflow-hidden">
            <DashboardScheduleSkeleton />
            <DashboardCompanyListSkeleton />
          </div>

          {/* Right column */}
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] gap-3 lg:gap-2 lg:overflow-hidden">
            <DashboardTodayTasksSkeleton />
            <DashboardDeadlinesSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
