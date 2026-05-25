import { ListPageFilterBarSkeleton, ListPageSkeleton } from "@/components/shared";
import { GakuchikaListPageHeaderSkeleton } from "@/components/skeletons/GakuchikaListPageHeaderSkeleton";

export function GakuchikaListSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main
        className="mx-auto max-w-7xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-8 sm:px-6 sm:py-10 lg:px-8"
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
