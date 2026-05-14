import { ListPageFilterBarSkeleton, ListPageSkeleton } from "@/components/shared";
import { GakuchikaListPageHeaderSkeleton } from "@/components/skeletons/GakuchikaListPageHeaderSkeleton";

export function GakuchikaListSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">ガクチカ一覧を読み込んでいます</span>
        <GakuchikaListPageHeaderSkeleton />
        <ListPageFilterBarSkeleton variant="gakuchika" />
        <ListPageSkeleton variant="gakuchika" />
      </main>
    </div>
  );
}

