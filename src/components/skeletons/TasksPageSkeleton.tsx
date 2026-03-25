import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function TasksPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <SkeletonText lines={1} widths={["12rem"]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonButton className="h-11 min-h-11 w-36" />
          <SkeletonButton className="h-11 min-h-11 w-36" />
        </div>
      </div>

      <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <SkeletonCircle className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-48 max-w-full rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <SkeletonPill className="h-5 w-16" />
                <Skeleton className="h-4 w-32 rounded-full" />
              </div>
              <Skeleton className="h-6 w-full max-w-md rounded-md" />
              <Skeleton className="h-4 w-40 rounded-md" />
            </div>
            <SkeletonButton className="h-9 w-16 shrink-0" />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 flex gap-2">
        {["w-24", "w-24", "w-20"].map((w, i) => (
          <Skeleton key={i} className={`h-10 ${w} rounded-lg`} />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-4 rounded-xl bg-muted/50 p-4"
          >
            <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonPill className="h-5 w-14" />
                <Skeleton className="h-3 w-28 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-5 w-full max-w-sm rounded-md" />
              <Skeleton className="mt-2 h-4 w-48 rounded-md" />
            </div>
            <SkeletonButton className="h-9 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
