import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

export function InterviewConversationSkeleton({
  accent = "面接の流れを整えています",
}: {
  accent?: string;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonPill className="h-4 w-28" />
            <Skeleton className="h-9 w-52 rounded-xl" />
          </div>
          <div className="flex gap-2">
            <SkeletonButton className="h-10 w-24" />
            <SkeletonButton className="h-10 w-24" />
          </div>
        </div>

        <div className="rounded-[28px] border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
          <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <span className="text-sm text-muted-foreground">{accent}</span>
            <SkeletonButton className="h-11 w-full rounded-2xl xl:min-w-[260px] xl:w-auto" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <SkeletonText lines={1} widths={["40%"]} />
            </div>
            <div className="space-y-2 text-right">
              <SkeletonPill className="h-5 w-16" />
              <SkeletonText lines={1} widths={["72px"]} />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="flex justify-start">
              <div className="w-[78%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={3} widths={["84%", "100%", "58%"]} />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="w-[62%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={2} widths={["100%", "62%"]} />
              </div>
            </div>
            <div className="flex justify-start">
              <div className="w-[72%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={2} widths={["92%", "66%"]} />
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 p-4">
            <div className="rounded-[24px] border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-3 border-b border-border/70 pb-3">
                <SkeletonCircle className="h-9 w-9" />
                <div className="flex-1">
                  <SkeletonText lines={1} widths={["28%"]} />
                </div>
              </div>
              <Skeleton className="mt-4 h-28 rounded-[20px]" />
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
          <div className="space-y-4 lg:flex-1 lg:overflow-y-auto">
            <div className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-28 rounded-lg" />
                <SkeletonPill className="h-5 w-16" />
              </div>
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border/60 bg-background/70 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <SkeletonText lines={1} widths={["42%"]} />
                      <SkeletonPill className="h-5 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
              <Skeleton className="h-5 w-24 rounded-lg" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border/60 bg-background/70 p-4"
                  >
                    <SkeletonText lines={1} widths={["34%"]} />
                    <SkeletonText className="mt-3" lines={2} widths={["100%", "76%"]} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
