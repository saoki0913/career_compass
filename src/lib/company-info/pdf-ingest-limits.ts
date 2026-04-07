import type { PaidPlan } from "@/lib/company-info/pricing";

/**
 * 企業RAG PDF 取込のページ上限（FastAPI `settings` と同じ既定値）。
 * 変更時は backend `app/config.py` と同期すること。
 */
export const RAG_PDF_MAX_PAGES: Record<PaidPlan, number> = {
  free: 20,
  standard: 60,
  pro: 120,
};

export const RAG_PDF_GOOGLE_OCR_MAX_PAGES: Record<PaidPlan, number> = {
  free: 5,
  standard: 30,
  pro: 60,
};

export const RAG_PDF_MISTRAL_OCR_MAX_PAGES: Record<PaidPlan, number> = {
  free: 0,
  standard: 10,
  pro: 20,
};

export function getRagPdfMaxIngestPages(plan: PaidPlan): number {
  return RAG_PDF_MAX_PAGES[plan] ?? RAG_PDF_MAX_PAGES.free;
}

export function getRagPdfMaxGoogleOcrPages(plan: PaidPlan): number {
  return RAG_PDF_GOOGLE_OCR_MAX_PAGES[plan] ?? RAG_PDF_GOOGLE_OCR_MAX_PAGES.free;
}

export function getRagPdfMaxMistralOcrPages(plan: PaidPlan): number {
  return RAG_PDF_MISTRAL_OCR_MAX_PAGES[plan] ?? RAG_PDF_MISTRAL_OCR_MAX_PAGES.free;
}

/**
 * @deprecated 新実装は Google / Mistral 別上限を使う。
 */
export function getRagPdfMaxOcrPages(plan: PaidPlan): number {
  return getRagPdfMaxGoogleOcrPages(plan);
}

/** 取込前に表示する方針説明（バックエンドの processing_notice_ja ベースと揃える） */
export function getRagPdfIngestPolicySummaryJa(plan: PaidPlan): string {
  const maxIngest = getRagPdfMaxIngestPages(plan);
  const maxGoogle = getRagPdfMaxGoogleOcrPages(plan);
  const maxMistral = getRagPdfMaxMistralOcrPages(plan);
  return `このプランでは最大${maxIngest}ページまで取り込みます。画像中心のページは Google OCR を最大${maxGoogle}ページ、難しいIR系ページは Mistral OCR を最大${maxMistral}ページまで使います。上限を超える分は取り込みません。`;
}
