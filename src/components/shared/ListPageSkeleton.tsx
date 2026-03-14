"use client";

interface ListPageSkeletonProps {
  count?: number;
  cardHeight?: string;
}

export function ListPageSkeleton({
  count = 8,
  cardHeight = "h-40",
}: ListPageSkeletonProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`${cardHeight} bg-muted/50 rounded-xl animate-pulse`}
        />
      ))}
    </div>
  );
}
