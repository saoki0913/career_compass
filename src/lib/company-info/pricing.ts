import type { PlanTypeWithGuest } from "@/lib/stripe/config";

export type CompanyInfoEligiblePlan = PlanTypeWithGuest;
export type PaidPlan = Exclude<PlanTypeWithGuest, "guest">;

/** 選考スケジュール取得の月次無料枠（JST 暦月）。Guest は API で拒否のため表示用 0。 */
export const MONTHLY_SCHEDULE_FETCH_FREE_LIMITS: Record<CompanyInfoEligiblePlan, number> = {
  guest: 0,
  free: 5,
  standard: 50,
  pro: 150,
};

/** 企業RAGの月次無料枠（URL クロール + PDF の合算ページ数）。`rag_ingest_units` の意味と一致。 */
const MONTHLY_RAG_FREE_PAGES: Record<PaidPlan, number> = {
  free: 10,
  standard: 100,
  pro: 300,
};

export const COMPANY_RAG_SOURCE_LIMITS: Record<PaidPlan, number> = {
  free: 3,
  standard: 100,
  pro: 500,
};

export function getMonthlyScheduleFetchFreeLimit(plan: CompanyInfoEligiblePlan): number {
  return MONTHLY_SCHEDULE_FETCH_FREE_LIMITS[plan];
}

export function getMonthlyRagFreeUnits(plan: PaidPlan): number {
  return MONTHLY_RAG_FREE_PAGES[plan];
}

export function getCompanyRagSourceLimit(plan: PaidPlan): number {
  return COMPANY_RAG_SOURCE_LIMITS[plan];
}

/** PDF の page_count を月次カウント・表示用に正規化（0 や欠損は 1 ページ扱い） */
export function normalizePdfPageCount(pageCount: number | null | undefined): number {
  const n = Math.floor(Number(pageCount));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/**
 * PDF 1 取込あたりの固定クレジット（文書ページ数の上限帯で決定）。
 * 月次無料枠でページを充当しても、このティア額は減らない（`applyCompanyRagUsage` の PDF 経路）。
 */
export function calculatePdfIngestCredits(pageCount: number | null | undefined): number {
  const n = normalizePdfPageCount(pageCount);
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 5) return 3;
  if (n <= 10) return 6;
  if (n <= 20) return 12;
  if (n <= 40) return 24;
  if (n <= 60) return 36;
  if (n <= 80) return 48;
  if (n <= 100) return 60;
  return 72;
}

export function calculateCorporateCrawlUnits(pagesCrawled: number): number {
  if (!Number.isFinite(pagesCrawled) || pagesCrawled <= 0) return 0;
  return Math.max(1, Math.floor(pagesCrawled));
}

export function estimateCorporateSourceUnits(params: {
  kind: "url" | "upload_pdf";
  pageCount?: number | null;
  pagesCrawled?: number | null;
}): number {
  if (params.kind === "upload_pdf") {
    return normalizePdfPageCount(params.pageCount ?? 0);
  }
  return calculateCorporateCrawlUnits(params.pagesCrawled ?? 1);
}

export function getCurrentJstMonthKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}
