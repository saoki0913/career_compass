import { describe, expect, it } from "vitest";
import { getCompanyNameClass, getDeadlineSummary } from "./company-display";

describe("getCompanyNameClass", () => {
  it("returns largest size for short names (<=6 chars)", () => {
    expect(getCompanyNameClass("三菱商事")).toContain("text-[13px]");
    expect(getCompanyNameClass("トヨタ")).toContain("text-[13px]");
  });

  it("returns medium size for 7-10 char names", () => {
    expect(getCompanyNameClass("野村総合研究所")).toContain("text-[12px]");
    expect(getCompanyNameClass("日本生命保険相互")).toContain("text-[12px]");
  });

  it("returns small size for 11-13 char names", () => {
    expect(getCompanyNameClass("東京海上日動あんしん生命")).toContain("text-[11px]");
  });

  it("returns smallest size for 14+ char names", () => {
    expect(getCompanyNameClass("三井住友海上火災保険株式会社")).toContain("text-[10px]");
  });
});

describe("getDeadlineSummary", () => {
  it("returns null for null deadline", () => {
    expect(getDeadlineSummary(null)).toBeNull();
  });

  it("returns overdue tone when daysLeft < 0", () => {
    const result = getDeadlineSummary({ id: "1", title: "ES", dueDate: "2026-01-01", type: "es_submission", daysLeft: -1 });
    expect(result?.tone).toBe("overdue");
    expect(result?.daysText).toBe("期限切れ");
  });

  it("returns urgent tone when daysLeft <= 3", () => {
    const result = getDeadlineSummary({ id: "1", title: "ES", dueDate: "2026-01-01", type: "es_submission", daysLeft: 2 });
    expect(result?.tone).toBe("urgent");
    expect(result?.daysText).toBe("2日");
  });
});
