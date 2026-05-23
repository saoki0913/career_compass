import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

/** Desktop-dense settings layout: shared header, profile/billing column, preferences/notifications column. */
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
      <ProductPageHeaderSkeleton
        variant="form"
        actionCount={1}
        showBadge={false}
        descriptionMode="always"
        showBackLink
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:items-start">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-28 rounded-lg" />
              <Skeleton className="h-4 w-36 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <SkeletonCircle className="h-14 w-14 rounded-full" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-56 max-w-full rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-28 rounded-lg" />
              <Skeleton className="h-4 w-40 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20 rounded-md" />
                    <Skeleton className="h-6 w-24 rounded-lg" />
                  </div>
                  <div className="space-y-2 text-right">
                    <Skeleton className="h-3 w-24 rounded-md" />
                    <Skeleton className="h-6 w-12 rounded-lg" />
                  </div>
                </div>
              </div>
              <SkeletonButton className="ml-auto h-9 w-24" />
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-28 rounded-lg" />
              <SkeletonText lines={1} widths={["min(18rem,100%)"]} />
            </CardHeader>
            <CardContent>
              <SkeletonButton className="h-10 w-32" />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="h-4 w-56 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Skeleton className="mb-2 h-4 w-20 rounded-md" />
                <div className="flex max-h-40 flex-wrap gap-2 overflow-hidden">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <SkeletonPill key={i} className="h-8 w-20" />
                  ))}
                </div>
              </div>
              <div className="border-t border-border/60 pt-4">
                <Skeleton className="mb-2 h-4 w-20 rounded-md" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <SkeletonPill key={i} className="h-8 w-24" />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-28 rounded-lg" />
              <Skeleton className="h-4 w-44 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-36 rounded-full" />
                    <SkeletonText lines={1} widths={["min(16rem,100%)"]} />
                  </div>
                  <SkeletonPill className="h-6 w-11" />
                </div>
              ))}
              <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md sm:w-40" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
