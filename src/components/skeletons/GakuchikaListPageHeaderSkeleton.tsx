import { ProductPageHeaderSkeleton } from "@/components/shared/ProductPageHeaderSkeleton";

/** `/gakuchika` 一覧の見出し行（タイトル・素材バッジ・説明・新規ボタン）のローディング用 */
export function GakuchikaListPageHeaderSkeleton() {
  return <ProductPageHeaderSkeleton actionCount={1} showBackLink />;
}
