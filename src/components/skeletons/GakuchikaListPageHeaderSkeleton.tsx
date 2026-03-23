import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from "@/components/ui/skeleton";

/** `/gakuchika` 一覧の見出し行（タイトル・素材バッジ・説明・新規ボタン）のローディング用 */
export function GakuchikaListPageHeaderSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-40 rounded-lg sm:w-48" />
          <SkeletonPill className="h-6 w-28" />
        </div>
        <SkeletonText lines={1} widths={["18rem"]} lineClassName="h-4" />
      </div>
      <SkeletonButton className="h-10 w-full shrink-0 sm:w-[9.5rem] sm:self-start" />
    </div>
  );
}
