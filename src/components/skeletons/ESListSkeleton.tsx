import { ListPageFilterBarSkeleton } from "@/components/shared/ListPageFilterBarSkeleton";
import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";
import { EsDocumentCardSkeleton } from "@/components/skeletons/EsDocumentCardSkeleton";

export function ESListSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">ES一覧を読み込んでいます</span>
        <ProductPageHeaderSkeleton actionCount={2} showBackLink />

        <ListPageFilterBarSkeleton variant="es" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EsDocumentCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
