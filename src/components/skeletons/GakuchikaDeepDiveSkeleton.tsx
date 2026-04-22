import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * ガクチカ作成会話画面（`/gakuchika/[id]`）のローディング用。
 * `ConversationWorkspaceShell` に近い構図で、header / action bar / chat / sidebar を揃える。
 * グローバル `DashboardHeader` は `loading.tsx` 等で別途表示する。
 */
export function GakuchikaDeepDiveSkeleton({
  accent = "ガクチカ作成の会話を読み込んでいます",
}: {
  accent?: string;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32 rounded-lg" />
              <Skeleton className="h-4 w-48 rounded-lg" />
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 xl:max-w-[760px] xl:items-end">
            <div className="w-full rounded-xl border border-border/50 bg-card px-4 py-3">
              <Skeleton className="h-4 w-56 rounded-lg" />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <SkeletonPill className="h-8 w-20" />
                  <SkeletonPill className="h-8 w-24" />
                </div>
                <SkeletonButton className="h-10 w-32 rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 overflow-hidden lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
            <div className="border-b border-border/50 px-3 py-3 sm:px-4 lg:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonPill className="h-5 w-16" />
                <SkeletonPill className="h-5 w-12" />
                <SkeletonPill className="h-5 w-10" />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="mx-auto max-w-3xl space-y-4">
                <p className="text-center text-xs text-muted-foreground">{accent}</p>
                <div className="flex justify-end">
                  <div className="w-[72%] rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <SkeletonText lines={2} widths={["100%", "55%"]} />
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="w-[85%] rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <SkeletonText lines={3} widths={["92%", "100%", "48%"]} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="w-[65%] rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <SkeletonText lines={2} widths={["100%", "40%"]} />
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-lg:pb-[calc(0.75rem+var(--mobile-bottom-nav-offset))] lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <div className="space-y-3">
                <Skeleton className="h-3 w-full max-w-md rounded-md" />
                <div className="flex items-end gap-2 rounded-xl border border-border/70 bg-card p-3">
                  <Skeleton className="min-h-[3rem] flex-1 rounded-lg" />
                  <SkeletonButton className="h-10 w-10 shrink-0 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-16 rounded-lg" />
                  <div className="flex gap-2">
                    <SkeletonButton className="h-9 w-20 rounded-xl" />
                    <SkeletonButton className="h-9 w-24 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <SkeletonPill className="h-6 w-14" />
                    <SkeletonPill className="h-6 w-20" />
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-[18px] border border-border/60 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-4 w-12 rounded-md" />
                        <Skeleton className="h-4 w-10 rounded-md" />
                      </div>
                    </div>
                  ))}
                  <SkeletonText lines={3} widths={["100%", "92%", "66%"]} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
