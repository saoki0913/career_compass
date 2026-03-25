import { describe, expect, it } from "vitest";

import {
  calculatePdfIngestCredits,
  calculateCorporateCrawlUnits,
  getMonthlyRagFreeUnits,
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

  it("caps free monthly RAG ingest pages at 10", () => {
    expect(getMonthlyRagFreeUnits("free")).toBe(10);
  });

  it("sets standard and pro monthly RAG free pages", () => {
    expect(getMonthlyRagFreeUnits("standard")).toBe(100);
    expect(getMonthlyRagFreeUnits("pro")).toBe(300);
  });

  it("normalizes PDF page counts for billing floors", () => {
    expect(normalizePdfPageCount(0)).toBe(1);
    expect(normalizePdfPageCount(null)).toBe(1);
    expect(normalizePdfPageCount(12)).toBe(12);
  });

  it("maps PDF page tiers to fixed credits (CREDITS.md §3.5)", () => {
    expect(calculatePdfIngestCredits(1)).toBe(1);
    expect(calculatePdfIngestCredits(2)).toBe(2);
    expect(calculatePdfIngestCredits(5)).toBe(3);
    expect(calculatePdfIngestCredits(10)).toBe(6);
    expect(calculatePdfIngestCredits(20)).toBe(12);
    expect(calculatePdfIngestCredits(40)).toBe(24);
    expect(calculatePdfIngestCredits(60)).toBe(36);
    expect(calculatePdfIngestCredits(80)).toBe(48);
    expect(calculatePdfIngestCredits(100)).toBe(60);
    expect(calculatePdfIngestCredits(101)).toBe(72);
  });

  it("counts corporate crawl pages", () => {
    expect(calculateCorporateCrawlUnits(0)).toBe(0);
    expect(calculateCorporateCrawlUnits(3)).toBe(3);
  });
});
