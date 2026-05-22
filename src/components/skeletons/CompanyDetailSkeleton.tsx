import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";

const shellClassName =
  "mx-auto max-w-[90rem] px-5 pb-6 pt-20 sm:px-6 md:px-7 lg:px-8 lg:py-6";

/** `/companies/[id]` の `CompanyDetailPageClient` 読み込み完了後レイアウトに合わせる */
export function CompanyDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className={shellClassName}>
        <Skeleton className="mb-5 h-4 w-36 rounded-md" />

        {/* 企業ヘッダー + クイックアクション */}
        <div className="mb-5 space-y-4 border-b border-border/50 pb-5">
          <div className="flex flex-col gap-4 min-[1180px]:flex-row min-[1180px]:items-start min-[1180px]:justify-between">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Skeleton className="h-10 w-52 max-w-full rounded-md sm:h-11 sm:w-64 lg:h-10" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SkeletonPill className="h-8 w-24" />
                  <SkeletonPill className="h-8 w-16" />
                  <SkeletonPill className="h-8 w-20" />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <SkeletonButton className="h-10 w-10 rounded-lg" />
                <SkeletonButton className="h-10 w-10 rounded-lg" />
              </div>
            </div>

            <div className="min-[1180px]:max-w-[52rem]">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-start min-[1180px]:justify-end">
                <SkeletonButton className="h-14 w-full rounded-xl sm:h-11 sm:w-[7rem] lg:h-10" />
                <SkeletonButton className="h-14 w-full rounded-xl sm:h-11 sm:w-[8rem] lg:h-10" />
                <SkeletonButton className="h-14 w-full rounded-xl sm:h-11 sm:w-[7rem] lg:h-10" />
                <SkeletonButton className="col-span-2 h-14 w-full rounded-xl sm:col-span-1 sm:h-11 sm:w-[13.5rem] lg:h-10" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 min-[1180px]:justify-end">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3 w-32 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* 締切・予定 | 応募枠 | この企業のES */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
          <Card className="min-h-[15rem] border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </div>
              <SkeletonButton className="h-10 w-14 rounded-lg lg:h-8" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex min-h-[9.5rem] flex-col items-center justify-center text-center">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="mt-4 h-4 w-44 max-w-full rounded-md" />
                <SkeletonButton className="mt-4 h-10 w-36 rounded-lg lg:h-8" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[15rem] border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              <SkeletonButton className="h-10 w-14 rounded-lg lg:h-8" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex min-h-[9.5rem] flex-col items-center justify-center text-center">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="mt-4 h-4 w-48 max-w-full rounded-md" />
                <SkeletonButton className="mt-4 h-10 w-32 rounded-lg lg:h-8" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[15rem] border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
                <Skeleton className="h-5 w-32 rounded-md" />
                <SkeletonPill className="h-5 w-10" />
              </div>
              <Skeleton className="h-4 w-16 rounded-md" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-3">
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
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 企業情報データベース */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <Skeleton className="h-5 w-44 max-w-full rounded-md" />
            </div>
            <SkeletonButton className="h-10 w-36 rounded-lg lg:h-8" />
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <SkeletonText lines={1} widths={["70%"]} lineClassName="h-3.5" />
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40 rounded-md" />
                  <Skeleton className="h-3 w-64 max-w-full rounded-md" />
                </div>
                <SkeletonPill className="h-8 w-44" />
              </div>
              <Skeleton className="mt-3 h-2 w-full rounded-full" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl border border-amber-200/70 bg-amber-50/70" />
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-background p-4">
                  <Skeleton className="h-3 w-24 rounded-md" />
                  <Skeleton className="mt-2 h-8 w-12 rounded-md" />
                  <Skeleton className="mt-2 h-3 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-3 w-8 rounded-md" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.from({ length: i === 2 ? 5 : 2 }).map((_, j) => (
                      <SkeletonPill key={j} className="h-9 w-20" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
