import {
  Skeleton,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
} from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Matches `/profile`: back link, profile Card, 2-col stats, education & target Cards. */
export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="mb-6 h-4 w-48 rounded-md" />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-6 w-32 rounded-lg" />
          </div>
          <SkeletonButton className="h-9 w-36" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <SkeletonCircle className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48 max-w-full rounded-lg" />
              <Skeleton className="h-4 w-56 max-w-full rounded-md" />
              <Skeleton className="h-3 w-40 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-4 w-12 rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
            ))}
            <SkeletonButton className="mt-2 h-9 w-full" />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-5 w-32 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-2">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-4 w-32 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Skeleton className="mb-2 h-3 w-20 rounded-md" />
            <div className="flex flex-wrap gap-2">
              <SkeletonPill className="h-6 w-16" />
              <SkeletonPill className="h-6 w-20" />
              <SkeletonPill className="h-6 w-14" />
            </div>
          </div>
          <div>
            <Skeleton className="mb-2 h-3 w-24 rounded-md" />
            <div className="flex flex-wrap gap-2">
              <SkeletonPill className="h-6 w-24" />
              <SkeletonPill className="h-6 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
