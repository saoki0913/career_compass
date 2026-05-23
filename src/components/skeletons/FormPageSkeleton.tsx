import {
  Skeleton,
  SkeletonButton,
  SkeletonPill,
} from "@/components/ui/skeleton";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

export function FormPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
        <ProductPageHeaderSkeleton
          variant="form"
          actionCount={0}
          showBadge={false}
          showBackLink
          descriptionMode="always"
        />

        <div className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap gap-2">
            <SkeletonPill className="h-8 w-24" />
            <SkeletonPill className="h-8 w-20" />
            <SkeletonPill className="h-8 w-28" />
          </div>
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className={i === 2 ? "h-28 w-full rounded-2xl" : "h-12 w-full rounded-xl"} />
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <SkeletonButton className="h-10 w-24" />
            <SkeletonButton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
