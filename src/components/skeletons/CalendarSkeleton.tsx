import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/** Matches `/calendar`: full-height column, header row, 3+1 grid, Card-wrapped month grid + sidebar. */
export function CalendarSkeleton() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40 rounded-xl" />
            <SkeletonText className="mt-2" lines={1} widths={["12rem"]} />
          </div>
          <div className="flex items-center gap-3">
            <SkeletonButton className="h-9 w-28" />
            <SkeletonButton className="h-9 w-32" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="flex min-h-0 flex-col lg:col-span-3">
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardHeader className="shrink-0 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <Skeleton className="h-6 w-36 rounded-md" />
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div className="sticky top-0 z-[1] mb-1 grid shrink-0 grid-cols-7 gap-1 border-b border-border/40 bg-card pb-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <SkeletonPill key={i} className="h-8 w-full rounded-lg" />
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 auto-rows-[minmax(4.5rem,auto)]">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex min-h-[4.5rem] flex-col rounded-lg border border-border/60 bg-background/70 p-1.5"
                    >
                      <SkeletonPill className="h-3 w-6" />
                      <div className="mt-1 space-y-1">
                        <Skeleton className="h-4 rounded-md" />
                        {i % 3 !== 0 ? <Skeleton className="h-3 rounded-md" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="hidden min-h-0 space-y-4 lg:col-span-1 lg:block">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[24px] border border-border/70 bg-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <SkeletonCircle className="h-10 w-10" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 rounded-full" />
                    <Skeleton className="h-3 w-16 rounded-full" />
                  </div>
                </div>
                <SkeletonText className="mt-4" lines={2} widths={["100%", "72%"]} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
