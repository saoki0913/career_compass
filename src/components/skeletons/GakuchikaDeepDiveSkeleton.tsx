import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/**
 * ガクチカ作成会話画面（`/gakuchika/[id]`）のローディング用。
 * コンパクトバー（STAR 帯）＋チャット＋入力の骨格。グローバル `DashboardHeader` は `loading.tsx` 等で別途表示する。
 */
export function GakuchikaDeepDiveSkeleton({
  accent = "ガクチカ作成の会話を読み込んでいます",
}: {
  accent?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <Skeleton className="h-3 w-20 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex min-w-0 flex-1 items-center gap-1">
                    <Skeleton className="h-2.5 w-4 shrink-0 rounded" />
                    <Skeleton className="h-1.5 min-w-[2rem] flex-1 rounded-full" />
                  </div>
                ))}
                <Skeleton className="h-3 w-8 shrink-0 rounded-md" />
              </div>
            </div>
            <SkeletonPill className="h-5 w-10 shrink-0" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
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
      </div>

      <div className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl px-4 pt-2">
            <Skeleton className="mb-2 h-3 w-full max-w-md rounded-md" />
            <div className="flex items-end gap-2 rounded-xl border border-border/70 bg-card p-3">
              <Skeleton className="min-h-[3rem] flex-1 rounded-lg" />
              <SkeletonButton className="h-10 w-10 shrink-0 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
