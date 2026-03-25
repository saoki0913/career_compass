import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * `ESEditorPageClient` 表示後のシェルに合わせる:
 * sticky ツールバー（戻る・パンくず・文字数・保存系・提出/保存/印刷/添削）、
 * 左エディタ max-w-4xl、lg 時右 45% 添削列。
 */
export function ESEditorSkeleton() {
  return (
    <div className="es-editor-print-scope flex h-screen flex-col overflow-hidden bg-background">
      <div className="print:hidden">
        <DashboardHeader />
      </div>

      <div className="sticky top-16 z-40 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" shimmerDelayMs={0} />
                <Skeleton className="hidden h-4 w-14 rounded sm:block" shimmerDelayMs={15} />
              </div>
              <span className="hidden h-4 w-px shrink-0 bg-muted-foreground/30 sm:block" aria-hidden />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Skeleton
                  className="hidden h-4 max-w-[200px] shrink-0 rounded sm:block sm:w-32"
                  shimmerDelayMs={30}
                />
                <Skeleton className="hidden h-3 w-2 shrink-0 rounded-sm sm:block" shimmerDelayMs={38} />
                <Skeleton
                  className="hidden h-4 max-w-[220px] flex-1 rounded lg:block"
                  shimmerDelayMs={45}
                />
                <Skeleton className="h-4 w-36 max-w-[150px] rounded sm:hidden" shimmerDelayMs={35} />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
              <Skeleton className="h-4 w-10 sm:w-14" shimmerDelayMs={55} />
              <Skeleton className="h-4 w-16 sm:w-20" shimmerDelayMs={65} />
              <SkeletonButton className="hidden h-8 min-w-[6.5rem] sm:inline-flex" shimmerDelayMs={80} />
              <SkeletonButton className="h-8 w-14" shimmerDelayMs={95} />
              <SkeletonButton className="hidden h-8 w-[5.5rem] sm:inline-flex" shimmerDelayMs={110} />
              <SkeletonButton className="hidden h-8 w-24 lg:inline-flex" shimmerDelayMs={125} />
            </div>
          </div>
        </div>
      </div>

      <main className="flex min-h-0 flex-1 overflow-hidden print:hidden">
        <div className="min-h-0 w-full flex-1 overflow-y-auto transition-all duration-300 lg:w-[55%]">
          <div className="es-print-body mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-6">
                <Skeleton className="mb-6 h-10 w-full max-w-xl rounded-md" shimmerDelayMs={0} />
                <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
                  <Skeleton className="h-4 w-40 rounded-md" shimmerDelayMs={25} />
                  <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:max-w-xs sm:items-end">
                    <Skeleton className="h-3 w-24 rounded-md sm:self-end" shimmerDelayMs={35} />
                    <Skeleton className="h-9 w-full rounded-md sm:w-44" shimmerDelayMs={45} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-full max-w-lg rounded-md" shimmerDelayMs={55} />
                    <SkeletonPill className="h-6 w-28" shimmerDelayMs={65} />
                    <Skeleton className="h-14 w-full rounded-lg" shimmerDelayMs={75} />
                  </div>
                  <Skeleton className="h-24 w-full rounded-lg" shimmerDelayMs={90} />
                  <Skeleton className="h-20 w-full rounded-lg" shimmerDelayMs={105} />
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-full max-w-md rounded-md" shimmerDelayMs={120} />
                    <SkeletonPill className="h-6 w-32" shimmerDelayMs={130} />
                    <Skeleton className="h-14 w-full rounded-lg" shimmerDelayMs={140} />
                  </div>
                  <Skeleton className="h-28 w-full rounded-lg" shimmerDelayMs={155} />
                </div>

                <div className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border">
                  <Skeleton className="h-4 w-4 rounded" shimmerDelayMs={170} />
                  <Skeleton className="h-4 w-32 rounded-md" shimmerDelayMs={175} />
                </div>
              </CardContent>
            </Card>
            <Skeleton className="mx-auto mt-6 h-4 w-72 max-w-full" shimmerDelayMs={185} />
          </div>
        </div>

        <div className="hidden min-h-0 w-[45%] flex-col overflow-hidden border-l border-border bg-muted/20 lg:flex">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-6 w-36 rounded-md" shimmerDelayMs={30} />
                <SkeletonPill className="h-5 w-20" shimmerDelayMs={50} />
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border/60 bg-background/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-4 w-28 rounded-full" shimmerDelayMs={index * 90 + 40} />
                      <SkeletonPill className="h-5 w-14" shimmerDelayMs={index * 90 + 55} />
                    </div>
                    <SkeletonText
                      className="mt-3"
                      lines={3}
                      widths={["100%", "86%", "72%"]}
                      staggerShimmerMs={45}
                    />
                  </div>
                ))}
              </div>
              <div className="shrink-0 border-t border-border/50 pt-4">
                <Skeleton className="mb-3 h-4 w-28 rounded-md" shimmerDelayMs={200} />
                <Skeleton className="h-16 w-full rounded-lg" shimmerDelayMs={215} />
              </div>
              <Skeleton className="h-10 w-full shrink-0 rounded-xl" shimmerDelayMs={230} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
