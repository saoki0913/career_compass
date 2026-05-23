import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

const shellClassName =
  "mx-auto max-w-[90rem] px-5 pb-6 pt-8 sm:px-6 sm:pt-10 md:px-7 lg:px-8 lg:py-6";

/** `/companies/[id]` の `CompanyDetailPageClient` 読み込み完了後レイアウトに合わせる */
export function CompanyDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className={shellClassName}>
        <ProductPageHeaderSkeleton
          variant="detail"
          actionCount={0}
          showBackLink
          actionsSkeleton={
            <div className="flex w-full min-w-0 flex-col gap-2 min-[1180px]:w-auto min-[1180px]:min-w-[24rem]">
              <div className="flex justify-end gap-2">
                <SkeletonButton className="h-10 w-10 rounded-lg lg:h-8 lg:w-8" />
                <SkeletonButton className="h-10 w-10 rounded-lg lg:h-8 lg:w-8" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonButton key={i} className="h-11 w-full rounded-xl lg:h-9" />
                ))}
              </div>
            </div>
          }
        />

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
