import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

interface PageTransitionSurfaceProps {
  title?: string;
}

export function PageTransitionSurface({
  title = "画面を読み込んでいます",
}: PageTransitionSurfaceProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
              就
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-[0.01em] text-foreground">
                就活Pass
              </p>
              <p className="text-xs text-muted-foreground">{title}</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-start px-4 py-8 sm:px-6 sm:py-10"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="w-full space-y-6">
          <div className="space-y-2">
            <SkeletonPill className="h-4 w-24" />
            <Skeleton className="h-9 w-56 rounded-xl sm:h-10 sm:w-72" />
            <SkeletonText lines={1} widths={["14rem"]} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4 rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-10 w-full rounded-xl" />
                <SkeletonButton className="h-10 w-28" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-[24px] border border-border/60 bg-background/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <SkeletonCircle className="h-11 w-11" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24 rounded-full" />
                          <Skeleton className="h-3 w-16 rounded-full" />
                        </div>
                      </div>
                      <SkeletonPill className="h-5 w-12" />
                    </div>
                    <SkeletonText
                      className="mt-4"
                      lines={3}
                      widths={["100%", "88%", "68%"]}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4 rounded-[28px] border border-border/70 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-28 rounded-full" />
                <SkeletonPill className="h-5 w-16" />
              </div>
              <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/70 p-4">
                <div className="flex items-center gap-3">
                  <SkeletonCircle className="h-10 w-10" />
                  <SkeletonText lines={2} widths={["8rem", "5rem"]} />
                </div>
                <SkeletonText lines={2} widths={["100%", "72%"]} />
              </div>
              <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/70 p-4">
                <div className="flex items-center gap-3">
                  <SkeletonCircle className="h-10 w-10" />
                  <SkeletonText lines={2} widths={["7rem", "4rem"]} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SkeletonPill className="h-8 w-20" />
                  <SkeletonPill className="h-8 w-24" />
                  <SkeletonPill className="h-8 w-16" />
                </div>
              </div>
              <SkeletonButton className="h-10 w-full rounded-[16px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
