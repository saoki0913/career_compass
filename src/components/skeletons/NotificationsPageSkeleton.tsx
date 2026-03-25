import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Notification rows only; use inside `/notifications` `main` below the real page header. */
export function NotificationsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48 max-w-full rounded-md" />
                    <Skeleton className="h-3 w-24 rounded-full" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Skeleton className="h-3 w-14 rounded-full" />
                    <SkeletonButton className="h-11 w-11 rounded-xl" />
                  </div>
                </div>
                <SkeletonText className="mt-2" lines={2} widths={["100%", "80%"]} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Route `loading.tsx`: header + list with same `main` chrome as the real page. */
export function NotificationsPageSkeleton() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <SkeletonText lines={1} widths={["11rem"]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonButton className="h-10 w-36" />
          <SkeletonButton className="h-10 w-32" />
        </div>
      </div>
      <NotificationsListSkeleton />
    </main>
  );
}
