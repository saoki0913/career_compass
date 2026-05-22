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

export function DashboardPipelineSkeleton() {
  return <DashboardCompanyListSkeleton />;
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

export function DashboardTasksSkeleton() {
  return <DashboardTodayTasksSkeleton />;
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

export function DashboardGreetingSkeleton() {
  return (
    <div className="flex min-h-9 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-2 xl:flex-nowrap">
      <Skeleton className="ml-14 h-6 w-48 max-w-full rounded-lg sm:w-60 lg:ml-0 lg:w-48 lg:min-w-0 lg:shrink" shimmerDelayMs={0} />
      <Skeleton className="hidden h-4 w-36 shrink-0 rounded 2xl:block" shimmerDelayMs={40} />
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:w-full sm:gap-3 lg:ml-auto lg:mr-0 lg:min-w-0 lg:basis-full lg:justify-end lg:gap-2 xl:basis-auto xl:overflow-visible">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className={`h-[68px] w-full rounded-xl sm:h-14 sm:w-auto sm:min-w-[132px] sm:flex-1 sm:rounded-lg lg:h-9 lg:min-w-0 lg:flex-none${i === 4 ? " col-span-2 sm:col-span-1" : ""}`}
            shimmerDelayMs={i * 30}
          />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="bg-background">
      <div
        className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-5 pb-5 pt-16 sm:px-6 sm:pt-14 lg:h-dvh lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:px-5 lg:py-3"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">ダッシュボードを読み込んでいます</span>
        {/* Greeting + quick action rail */}
        <DashboardGreetingSkeleton />

        {/* Two-column layout */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:gap-2 lg:overflow-hidden">
          {/* Left column */}
          <div className="flex min-h-0 flex-col gap-4 lg:grid lg:grid-rows-[minmax(0,1.42fr)_minmax(0,1fr)] lg:gap-2 lg:overflow-hidden">
            <DashboardScheduleSkeleton />
            <DashboardPipelineSkeleton />
          </div>

          {/* Right column */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] lg:gap-2 lg:overflow-hidden">
            <DashboardTasksSkeleton />
            <DashboardDeadlinesSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
