import { describe, expect, it } from "vitest";

import {
  calculatePdfIngestCredits,
  calculateCorporateCrawlUnits,
  getMonthlyRagHtmlFreeUnits,
  getMonthlyRagPdfFreeUnits,
  MONTHLY_SCHEDULE_FETCH_FREE_LIMITS,
  normalizePdfPageCount,
} from "@/lib/company-info/pricing";

describe("company-info/pricing", () => {
  it("uses monthly schedule free limits per plan", () => {
    expect(MONTHLY_SCHEDULE_FETCH_FREE_LIMITS).toMatchObject({
      guest: 0,
      free: 5,
      standard: 50,
      pro: 150,
    });
  });

  it("sets monthly free HTML pages by plan", () => {
    expect(getMonthlyRagHtmlFreeUnits("free")).toBe(10);
    expect(getMonthlyRagHtmlFreeUnits("standard")).toBe(100);
    expect(getMonthlyRagHtmlFreeUnits("pro")).toBe(300);
  });

  it("sets monthly free PDF pages by plan", () => {
    expect(getMonthlyRagPdfFreeUnits("free")).toBe(40);
    expect(getMonthlyRagPdfFreeUnits("standard")).toBe(200);
    expect(getMonthlyRagPdfFreeUnits("pro")).toBe(600);
  });

  it("normalizes PDF page counts for billing floors", () => {
    expect(normalizePdfPageCount(0)).toBe(1);
    expect(normalizePdfPageCount(null)).toBe(1);
    expect(normalizePdfPageCount(12)).toBe(12);
  });

  it("maps PDF overflow pages to lightweight credits", () => {
    expect(calculatePdfIngestCredits(0)).toBe(0);
    expect(calculatePdfIngestCredits(1)).toBe(2);
    expect(calculatePdfIngestCredits(20)).toBe(2);
    expect(calculatePdfIngestCredits(21)).toBe(6);
    expect(calculatePdfIngestCredits(60)).toBe(6);
    expect(calculatePdfIngestCredits(61)).toBe(12);
    expect(calculatePdfIngestCredits(120)).toBe(12);
  });

  it("counts corporate crawl pages", () => {
    expect(calculateCorporateCrawlUnits(0)).toBe(0);
    expect(calculateCorporateCrawlUnits(3)).toBe(3);
  });
});
