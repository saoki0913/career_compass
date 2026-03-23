import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";
import { Skeleton, SkeletonButton, SkeletonText } from "@/components/ui/skeleton";
import { EsDocumentCardSkeleton } from "@/components/skeletons/EsDocumentCardSkeleton";

export function ESListSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <SkeletonText lines={1} widths={["10rem"]} />
          </div>
          <div className="flex gap-2">
            <SkeletonButton className="h-10 w-28 sm:h-11" />
            <SkeletonButton className="h-10 w-32 sm:h-11" />
          </div>
        </div>

        <ListPageFilterBarSkeleton variant="es" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EsDocumentCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
