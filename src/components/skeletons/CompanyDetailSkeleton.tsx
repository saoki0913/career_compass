import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

/** `/companies/[id]` の `CompanyDetailPageClient` 読み込み完了後レイアウトに合わせる */
export function CompanyDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <Skeleton className="mb-4 h-4 w-36 rounded-md" />

        {/* 企業ヘッダー + クイックアクション（border-b 帯） */}
        <div className="mb-4 flex flex-col gap-3 border-b border-border/50 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-7 w-48 max-w-full rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonPill className="h-7 w-24" />
              <Skeleton className="h-4 w-px rounded-full" />
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-px rounded-full" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SkeletonButton className="h-9 w-[6.5rem]" />
              <SkeletonButton className="h-9 w-[5.5rem]" />
              <SkeletonButton className="h-9 w-28" />
              <div className="ml-1 flex gap-0.5 border-l border-border/50 pl-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Skeleton className="h-3 w-24 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </div>
        </div>

        {/* 締切・予定 | 応募枠 */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-32 rounded-md" />
                <SkeletonPill className="h-5 w-20" />
              </div>
              <div className="flex gap-2">
                <SkeletonButton className="h-8 w-20" />
                <SkeletonButton className="h-8 w-14" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2 overflow-hidden pb-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonPill key={i} className="h-8 w-[5.5rem] shrink-0" />
                ))}
              </div>
              <div className="max-h-[200px] space-y-3 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
                  >
                    <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <SkeletonPill className="h-5 w-16" />
                        <SkeletonPill className="h-5 w-14" />
                      </div>
                      <Skeleton className="h-4 w-full max-w-xs rounded-md" />
                      <Skeleton className="h-3 w-40 rounded-md" />
                    </div>
                    <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              <SkeletonButton className="h-8 w-14" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[200px] space-y-2 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <SkeletonPill className="h-5 w-20" />
                        <SkeletonPill className="h-5 w-16" />
                      </div>
                      <Skeleton className="h-4 w-full max-w-[14rem] rounded-md" />
                      <Skeleton className="h-3 w-48 rounded-md" />
                    </div>
                    <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 企業情報データベース | この企業のES */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-44 rounded-md" />
              </div>
              <SkeletonButton className="h-8 w-36" />
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <SkeletonText lines={2} widths={["100%", "85%"]} lineClassName="h-3.5" />
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="mt-2 h-3 w-full max-w-sm rounded-md" />
                <Skeleton className="mt-3 h-2 w-full rounded-full" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-background p-4">
                    <Skeleton className="h-3 w-24 rounded-md" />
                    <Skeleton className="mt-2 h-8 w-12 rounded-md" />
                    <Skeleton className="mt-2 h-3 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-36 rounded-md" />
                <SkeletonPill className="h-5 w-10" />
              </div>
              <Skeleton className="h-3 w-16 rounded-md" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[200px] space-y-2 overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                    <Skeleton className="h-5 w-5 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-full max-w-[12rem] rounded-md" />
                      <div className="flex gap-2">
                        <SkeletonPill className="h-5 w-14" />
                        <Skeleton className="h-3 w-16 rounded-md" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
