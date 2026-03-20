import type { PlanTypeWithGuest } from "@/lib/stripe/config";

export type CompanyInfoEligiblePlan = PlanTypeWithGuest;
export type PaidPlan = Exclude<PlanTypeWithGuest, "guest">;

export const DAILY_SCHEDULE_FETCH_LIMITS: Record<CompanyInfoEligiblePlan, number> = {
  guest: 5,
  free: 10,
  standard: 20,
  pro: 40,
};

export const MONTHLY_RAG_FREE_UNITS: Record<PaidPlan, number> = {
  free: 160,
  standard: 640,
  pro: 2400,
};

export const COMPANY_RAG_SOURCE_LIMITS: Record<PaidPlan, number> = {
  free: 10,
  standard: 100,
  pro: 500,
};

export const COMPANY_RAG_UNITS_PER_CREDIT = 40;

export function getDailyScheduleFetchLimit(plan: CompanyInfoEligiblePlan): number {
  return DAILY_SCHEDULE_FETCH_LIMITS[plan];
}

export function getMonthlyRagFreeUnits(plan: PaidPlan): number {
  return MONTHLY_RAG_FREE_UNITS[plan];
}

export function getCompanyRagSourceLimit(plan: PaidPlan): number {
  return COMPANY_RAG_SOURCE_LIMITS[plan];
}

export function calculatePdfIngestUnits(pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return 2;
  if (pageCount <= 10) return 2;
  if (pageCount <= 30) return 4;
  if (pageCount <= 60) return 6;
  return 10;
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
    return calculatePdfIngestUnits(params.pageCount ?? 0);
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
