import type { PaidPlan } from "@/lib/company-info/pricing";

/**
 * 企業RAG PDF 取込のページ上限（FastAPI `settings` と同じ既定値）。
 * 変更時は backend `app/config.py` と同期すること。
 */
export const RAG_PDF_MAX_PAGES: Record<PaidPlan, number> = {
  free: 24,
  standard: 72,
  pro: 120,
};

export const RAG_PDF_OCR_MAX_PAGES: Record<PaidPlan, number> = {
  free: 10,
  standard: 32,
  pro: 48,
};

export function getRagPdfMaxIngestPages(plan: PaidPlan): number {
  return RAG_PDF_MAX_PAGES[plan] ?? RAG_PDF_MAX_PAGES.free;
}

export function getRagPdfMaxOcrPages(plan: PaidPlan): number {
  return RAG_PDF_OCR_MAX_PAGES[plan] ?? RAG_PDF_OCR_MAX_PAGES.free;
}

/** 取込前に表示する方針説明（バックエンドの processing_notice_ja ベースと揃える） */
export function getRagPdfIngestPolicySummaryJa(plan: PaidPlan): string {
  const maxIngest = getRagPdfMaxIngestPages(plan);
  const maxOcr = getRagPdfMaxOcrPages(plan);
  return `このプランでは最大${maxIngest}ページまで取り込みます。それを超える場合は先頭${maxIngest}ページのみ処理します。画像中心のPDFでOCRが必要な場合、先頭最大${maxOcr}ページまでOCRします。`;
}
