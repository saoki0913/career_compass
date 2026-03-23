import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from "@/components/ui/skeleton";

function StatCardSkeleton({ delay }: { delay: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 rounded-md" shimmerDelayMs={delay} />
          <Skeleton className="h-9 w-20 rounded-xl" shimmerDelayMs={delay + 30} />
          <SkeletonText lines={1} widths={["10rem"]} staggerShimmerMs={40} lineClassName="h-3" />
        </div>
        <div className="shrink-0 rounded-xl bg-muted p-3">
          <Skeleton className="h-6 w-6 rounded-lg" shimmerDelayMs={delay + 15} />
        </div>
      </div>
    </div>
  );
}

function QuickActionSkeletonCell({ delay }: { delay: number }) {
  return (
    <div className="flex h-[136px] flex-col justify-start rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
      <Skeleton className="h-10 w-10 rounded-xl" shimmerDelayMs={delay} />
      <Skeleton className="mt-3 h-4 w-28 rounded-md" shimmerDelayMs={delay + 25} />
      <Skeleton className="mt-2 h-3 w-36 rounded-md" shimmerDelayMs={delay + 45} />
    </div>
  );
}

/** 今日の最重要タスク（コンパクト版）に合わせたスケルトン — `initialTodayTask.task` があるときのみ表示 */
function TodayTaskCardSkeleton() {
  return (
    <div className="w-full max-h-24 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 sm:w-[420px]">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" shimmerDelayMs={50} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-36 rounded-md" shimmerDelayMs={60} />
            <Skeleton className="h-6 w-[4.5rem] shrink-0 rounded-md" shimmerDelayMs={75} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SkeletonPill className="h-5 w-16" shimmerDelayMs={85} />
            <Skeleton className="h-3 w-24 rounded-md" shimmerDelayMs={95} />
          </div>
          <Skeleton className="h-3.5 w-full max-w-[14rem] rounded-md" shimmerDelayMs={105} />
        </div>
      </div>
    </div>
  );
}

export type DashboardSkeletonProps = {
  /**
   * 実 UI と同様、`todayTask.task` があるときだけ今日のタスク枠のスケルトンを出す。
   * Suspense fallback 等では未指定（false）のまま。
   */
  showTodayTaskSkeleton?: boolean;
};

export function DashboardSkeleton({ showTodayTaskSkeleton = false }: DashboardSkeletonProps) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex min-h-[4.5rem] flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-56 max-w-full rounded-lg sm:w-72" shimmerDelayMs={0} />
              <SkeletonPill className="h-6 w-28" shimmerDelayMs={40} />
            </div>
            <SkeletonText lines={1} widths={["14rem"]} staggerShimmerMs={35} />
          </div>
          {showTodayTaskSkeleton ? <TodayTaskCardSkeleton /> : null}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
          <StatCardSkeleton delay={0} />
          <StatCardSkeleton delay={80} />
          <div className="col-span-2 lg:col-span-1">
            <StatCardSkeleton delay={140} />
          </div>
        </div>

        <section className="mb-8">
          <Skeleton className="mb-4 h-7 w-40 rounded-md" shimmerDelayMs={10} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <QuickActionSkeletonCell key={index} delay={index * 40} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-7 w-28 rounded-md" shimmerDelayMs={0} />
              <SkeletonButton className="h-9 w-24" shimmerDelayMs={40} />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg border border-transparent p-3"
                >
                  <Skeleton
                    className="h-10 w-1 shrink-0 rounded-full"
                    shimmerDelayMs={index * 70}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Skeleton
                        className="h-4 w-40 max-w-full rounded-md"
                        shimmerDelayMs={index * 70 + 15}
                      />
                      <SkeletonPill className="h-5 w-14" shimmerDelayMs={index * 70 + 30} />
                    </div>
                    <SkeletonText lines={1} widths={["60%"]} staggerShimmerMs={25} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <Skeleton className="h-7 w-32 rounded-md" shimmerDelayMs={20} />
              <SkeletonButton className="h-9 w-28" shimmerDelayMs={55} />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4"
                >
                  <Skeleton
                    className="h-12 w-12 shrink-0 rounded-xl"
                    shimmerDelayMs={index * 65}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton
                      className="h-4 w-full max-w-[200px] rounded-md"
                      shimmerDelayMs={index * 65 + 20}
                    />
                    <Skeleton
                      className="h-3 w-32 rounded-md"
                      shimmerDelayMs={index * 65 + 35}
                    />
                  </div>
                  <div className="shrink-0 space-y-1.5 text-right">
                    <Skeleton
                      className="ml-auto h-4 w-16 rounded-md"
                      shimmerDelayMs={index * 65 + 10}
                    />
                    <Skeleton
                      className="ml-auto h-3 w-20 rounded-md"
                      shimmerDelayMs={index * 65 + 25}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
