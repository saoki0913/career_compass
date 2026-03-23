import { EsDocumentCardSkeleton } from "@/components/skeletons/EsDocumentCardSkeleton";
import { GakuchikaCardSkeleton } from "@/components/skeletons/GakuchikaCardSkeleton";

interface ListPageSkeletonProps {
  count?: number;
  /** `es` = ES 一覧カード, `gakuchika` = ガクチカ一覧カード */
  variant?: "es" | "gakuchika";
}

/** Grid matching `ESGrid` / `GakuchikaGrid` breakpoints. */
export function ListPageSkeleton({ count = 8, variant = "es" }: ListPageSkeletonProps) {
  const Card = variant === "gakuchika" ? GakuchikaCardSkeleton : EsDocumentCardSkeleton;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}
