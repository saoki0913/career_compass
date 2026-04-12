import type { PlanTypeWithGuest } from "@/lib/stripe/config";

export type CompanyInfoEligiblePlan = PlanTypeWithGuest;
export type PaidPlan = Exclude<PlanTypeWithGuest, "guest">;

/** 選考スケジュール取得の月次無料枠（JST 暦月）。Guest は API で拒否のため表示用 0。 */
export const MONTHLY_SCHEDULE_FETCH_FREE_LIMITS: Record<CompanyInfoEligiblePlan, number> = {
  guest: 0,
  free: 10,
  standard: 100,
  pro: 200,
};

/** 企業RAG URL の月次無料枠（ページ）。 */
const MONTHLY_RAG_HTML_FREE_PAGES: Record<PaidPlan, number> = {
  free: 20,
  standard: 200,
  pro: 500,
};

/** 企業RAG PDF の月次無料枠（ページ）。 */
const MONTHLY_RAG_PDF_FREE_PAGES: Record<PaidPlan, number> = {
  free: 60,
  standard: 250,
  pro: 600,
};

export const COMPANY_RAG_SOURCE_LIMITS: Record<PaidPlan, number> = {
  free: 3,
  standard: 100,
  pro: 500,
};

export function getMonthlyScheduleFetchFreeLimit(plan: CompanyInfoEligiblePlan): number {
  return MONTHLY_SCHEDULE_FETCH_FREE_LIMITS[plan];
}

export function getMonthlyRagHtmlFreeUnits(plan: PaidPlan): number {
  return MONTHLY_RAG_HTML_FREE_PAGES[plan];
}

export function getMonthlyRagPdfFreeUnits(plan: PaidPlan): number {
  return MONTHLY_RAG_PDF_FREE_PAGES[plan];
}

/**
 * @deprecated URL/PDF 分離前の互換 API。新実装は HTML/PDF 別 helper を使う。
 */
export function getMonthlyRagFreeUnits(plan: PaidPlan): number {
  return getMonthlyRagHtmlFreeUnits(plan);
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
 * PDF 無料枠超過時の軽量クレジット。
 * 超過ページ数に対して 1-20p=2, 21-60p=6, 61p+=12 を返す。
 */
export function calculatePdfIngestCredits(pageCount: number | null | undefined): number {
  const raw = Math.floor(Number(pageCount));
  const n = Number.isFinite(raw) ? raw : 0;
  if (n <= 0) return 0;
  if (n <= 20) return 2;
  if (n <= 60) return 6;
  return 12;
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
