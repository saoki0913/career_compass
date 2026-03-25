import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

export function ConversationPageSkeleton({
  accent = "企業情報を読み込んでいます",
}: {
  accent?: string;
}) {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <SkeletonPill className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <span className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-sm text-muted-foreground">
            {accent}
          </span>
        </div>
      </div>

      <div className="mt-6 grid flex-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <SkeletonPill className="h-5 w-16" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={3} widths={["100%", "86%", "68%"]} />
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={2} widths={["94%", "62%"]} />
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3"
                >
                  <SkeletonCircle className="h-8 w-8" />
                  <div className="flex-1">
                    <SkeletonText lines={1} widths={["70%"]} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
            <div className="flex items-center gap-3">
              <SkeletonCircle className="h-10 w-10" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-3 w-20 rounded-full" />
              </div>
            </div>
            <SkeletonButton className="h-10 w-24" />
          </div>
          <div className="space-y-4 pt-5">
            <div className="flex justify-end">
              <div className="w-[68%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={2} widths={["100%", "64%"]} />
              </div>
            </div>
            <div className="flex justify-start">
              <div className="w-[78%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={3} widths={["88%", "100%", "54%"]} />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="w-[62%] rounded-[24px] border border-border/60 bg-background/70 p-4">
                <SkeletonText lines={2} widths={["100%", "58%"]} />
              </div>
            </div>
            <div className="pt-6">
              <div className="rounded-[24px] border border-border/60 bg-background/70 p-4">
                <div className="flex items-center gap-2 border-b border-border/70 pb-3">
                  <SkeletonButton className="h-9 w-20" />
                  <SkeletonButton className="h-9 w-20" />
                </div>
                <Skeleton className="mt-4 h-28 rounded-[20px]" />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <SkeletonPill className="h-8 w-16" />
                    <SkeletonPill className="h-8 w-20" />
                  </div>
                  <SkeletonButton className="h-10 w-28" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
