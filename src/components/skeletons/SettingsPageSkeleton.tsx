import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Single-column layout matching `/settings` (`max-w-3xl`, stacked Cards). */
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-0 px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-24 rounded-xl" />
        <SkeletonText lines={1} widths={["16rem"]} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-40 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <SkeletonCircle className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48 max-w-full rounded-md" />
              <Skeleton className="h-3 w-28 rounded-md" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-44 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonPill key={i} className="h-8 w-20" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-44 rounded-md" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonPill key={i} className="h-8 w-24" />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mb-12 flex justify-end">
        <SkeletonButton className="h-10 w-28" />
      </div>

      <Card className="mt-12">
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-48 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 rounded-full" />
              <SkeletonText lines={1} widths={["12rem"]} />
            </div>
            <SkeletonButton className="h-9 w-24" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>

      <Card className="mt-12">
        <CardHeader>
          <Skeleton className="h-6 w-36 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-52 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border/60 p-4"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-36 rounded-full" />
                <SkeletonText lines={1} widths={["10rem"]} />
              </div>
              <SkeletonPill className="h-6 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
