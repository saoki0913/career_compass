import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/** Matches `/calendar`: responsive header, card-wrapped month grid, mobile summary cards, and desktop side rail. */
export function CalendarSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50/80">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-4 pb-mobile-tab sm:gap-5 sm:px-6 sm:py-5 md:px-7 lg:h-dvh lg:overflow-hidden lg:px-8 lg:py-7">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="order-2 min-w-0 sm:order-1 sm:pl-14 lg:pl-0">
            <Skeleton className="h-6 w-28 rounded-full bg-white sm:h-7 sm:w-32" />
            <Skeleton className="mt-2 h-9 w-44 rounded-2xl sm:mt-3 sm:h-14 sm:w-64 lg:h-11 lg:w-48" />
            <div className="mt-2 max-w-[22rem] sm:mt-3">
              <SkeletonText lines={1} widths={["100%"]} />
            </div>
          </div>
          <div className="order-1 flex w-full flex-wrap gap-2 pl-14 sm:order-2 sm:w-auto sm:justify-end sm:gap-3 sm:pl-0">
            <SkeletonButton className="h-11 w-24 rounded-2xl sm:w-28" />
            <SkeletonButton className="h-11 w-28 rounded-2xl sm:w-32" />
          </div>
        </div>

        <div className="lg:hidden">
          <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-h-11 sm:px-4">
            <SkeletonCircle className="h-4 w-4" />
            <Skeleton className="h-4 min-w-0 flex-1 rounded-full" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-h-0 flex-col">
            <Card className="flex min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <CardHeader className="shrink-0 px-4 pb-2 pt-4 sm:px-8 sm:pb-3 sm:pt-6">
                <div className="flex items-center justify-center gap-4 sm:gap-8">
                  <Skeleton className="h-10 w-10 rounded-full sm:h-11 sm:w-11" />
                  <Skeleton className="h-7 w-36 rounded-xl sm:h-8 sm:w-44" />
                  <Skeleton className="h-10 w-10 rounded-full sm:h-11 sm:w-11" />
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-8 sm:pb-5 lg:overflow-y-auto">
                <div className="grid shrink-0 grid-cols-7 gap-1 pb-3 sm:gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <SkeletonPill key={i} className="h-8 w-full rounded-xl" />
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-[minmax(5.5rem,auto)] gap-1.5 sm:auto-rows-[minmax(5.8rem,auto)] sm:gap-2 md:auto-rows-[minmax(6.4rem,auto)] lg:auto-rows-[minmax(5.8rem,1fr)] xl:auto-rows-[minmax(6.4rem,1fr)]">
                  {Array.from({ length: 42 }).map((_, i) => (
                    <div
                      key={i}
                      className="min-h-[5.5rem] rounded-xl border border-slate-200 bg-white p-1 sm:min-h-24 sm:rounded-2xl sm:p-2 md:min-h-[6.4rem] lg:min-h-0"
                    >
                      <SkeletonPill className="h-6 w-6 rounded-full sm:h-7 sm:w-7" />
                      <div className="mt-1 space-y-1">
                        <Skeleton className="h-6 rounded sm:h-5 sm:rounded-md" />
                        {i % 3 !== 0 ? <Skeleton className="h-6 rounded sm:h-5 sm:rounded-md" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <div className="flex flex-wrap items-center gap-5 px-5 pb-5 text-sm sm:px-8">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-full" />
              </div>
            </Card>
          </div>

          <div className="hidden min-h-0 space-y-4 overflow-y-auto lg:block">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.07)]"
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

        <div className="space-y-4 md:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.07)]"
            >
              <div className="flex items-center gap-3">
                <SkeletonCircle className="h-10 w-10" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <SkeletonText className="mt-4" lines={2} widths={["100%", "72%"]} />
            </div>
          ))}
        </div>

        <div className="hidden md:block lg:hidden">
          <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3">
              <SkeletonCircle className="h-10 w-10" />
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
