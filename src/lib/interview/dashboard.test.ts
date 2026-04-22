import { describe, expect, it } from "vitest";

import {
  buildInterviewDashboardPayload,
  computeCompanyHeatmap,
  computeFormatHeatmap,
  computeRecurringIssues,
  computeTrendSeries,
  INTERVIEW_AXES,
  INTERVIEW_FORMATS,
  type InterviewHistoryRow,
} from "./dashboard";

function makeHistory(overrides: Partial<InterviewHistoryRow>): InterviewHistoryRow {
  return {
    companyId: "cmp-1",
    companyName: "Alpha Corp",
    interviewFormat: "standard_behavioral",
    scores: {
      company_fit: 3,
      role_fit: 3,
      specificity: 3,
      logic: 3,
      persuasiveness: 3,
      consistency: 3,
      credibility: 3,
    },
    improvements: [],
    completedAt: "2026-04-10T01:00:00.000Z",
    ...overrides,
  };
}

describe("computeTrendSeries", () => {
  it("returns empty array for empty histories", () => {
    expect(computeTrendSeries([], 10)).toEqual([]);
  });

  it("emits 7 axis points per session (oldest -> newest)", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({
        completedAt: "2026-04-12T10:00:00.000Z",
        scores: {
          company_fit: 4,
          role_fit: 4,
          specificity: 4,
          logic: 4,
          persuasiveness: 4,
          consistency: 4,
          credibility: 4,
        },
      }),
      makeHistory({
        completedAt: "2026-04-10T10:00:00.000Z",
        scores: {
          company_fit: 2,
          role_fit: 2,
          specificity: 2,
          logic: 2,
          persuasiveness: 2,
          consistency: 2,
          credibility: 2,
        },
      }),
    ];
    const points = computeTrendSeries(histories, 10);
    expect(points).toHaveLength(14);
    // first 7 points correspond to the older session
    expect(points[0].score).toBe(2);
    expect(points[0].axis).toBe("company_fit");
    expect(points[7].score).toBe(4);
  });

  it("respects the limit parameter to slice most recent sessions", () => {
    const histories: InterviewHistoryRow[] = Array.from({ length: 5 }, (_, i) =>
      makeHistory({
        completedAt: new Date(2026, 0, 1 + i).toISOString(),
        scores: { company_fit: i + 1 },
      }),
    ).reverse(); // newest-first

    const points = computeTrendSeries(histories, 2);
    // only 2 sessions * 1 valid axis = 2 points (specificity/logic etc missing)
    expect(points).toHaveLength(2);
    // session order: oldest slice first
    expect(points[0].score).toBeLessThan(points[1].score);
  });

  it("skips axes whose score is not a finite number", () => {
    const points = computeTrendSeries([
      makeHistory({
        completedAt: "2026-04-12T10:00:00.000Z",
        scores: { company_fit: 3, role_fit: "bad", specificity: null, logic: 2 },
      }),
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.axis)).toEqual(["company_fit", "logic"]);
  });
});

describe("computeCompanyHeatmap", () => {
  it("returns empty for empty input", () => {
    expect(computeCompanyHeatmap([], 10)).toEqual([]);
  });

  it("averages scores by company and emits 7 rows per company", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ companyName: "Alpha Corp", scores: { company_fit: 4 } }),
      makeHistory({ companyName: "Alpha Corp", scores: { company_fit: 2 } }),
      makeHistory({ companyName: "Beta Inc", scores: { company_fit: 5 } }),
    ];
    const cells = computeCompanyHeatmap(histories, 10);
    expect(cells).toHaveLength(14); // 2 companies * 7 axes
    const alphaFit = cells.find((c) => c.company === "Alpha Corp" && c.axis === "company_fit");
    expect(alphaFit?.avgScore).toBe(3);
    expect(alphaFit?.sampleSize).toBe(2);
    const betaFit = cells.find((c) => c.company === "Beta Inc" && c.axis === "company_fit");
    expect(betaFit?.avgScore).toBe(5);
    expect(betaFit?.sampleSize).toBe(1);
  });

  it("sorts by session count desc and respects limit", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ companyName: "Alpha" }),
      makeHistory({ companyName: "Alpha" }),
      makeHistory({ companyName: "Alpha" }),
      makeHistory({ companyName: "Beta" }),
      makeHistory({ companyName: "Gamma" }),
      makeHistory({ companyName: "Gamma" }),
    ];
    const cells = computeCompanyHeatmap(histories, 2);
    const companies = new Set(cells.map((c) => c.company));
    expect(companies.has("Alpha")).toBe(true);
    expect(companies.has("Gamma")).toBe(true);
    expect(companies.has("Beta")).toBe(false);
    expect(cells).toHaveLength(14);
  });

  it("falls back to companyId when companyName is missing", () => {
    const cells = computeCompanyHeatmap(
      [makeHistory({ companyName: null, companyId: "cmp-42" })],
      10,
    );
    expect(cells.every((c) => c.company === "cmp-42")).toBe(true);
  });
});

describe("computeFormatHeatmap", () => {
  it("emits 4 formats * 7 axes = 28 cells even when empty", () => {
    const cells = computeFormatHeatmap([]);
    expect(cells).toHaveLength(INTERVIEW_FORMATS.length * INTERVIEW_AXES.length);
    expect(cells.every((c) => c.sampleSize === 0 && c.avgScore === 0)).toBe(true);
  });

  it("computes per-format averages", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ interviewFormat: "standard_behavioral", scores: { logic: 4 } }),
      makeHistory({ interviewFormat: "standard_behavioral", scores: { logic: 2 } }),
      makeHistory({ interviewFormat: "case", scores: { logic: 5 } }),
    ];
    const cells = computeFormatHeatmap(histories);
    const stdLogic = cells.find((c) => c.format === "standard_behavioral" && c.axis === "logic");
    expect(stdLogic?.avgScore).toBe(3);
    expect(stdLogic?.sampleSize).toBe(2);
    const caseLogic = cells.find((c) => c.format === "case" && c.axis === "logic");
    expect(caseLogic?.avgScore).toBe(5);
    const techLogic = cells.find((c) => c.format === "technical" && c.axis === "logic");
    expect(techLogic?.sampleSize).toBe(0);
  });

  it("ignores unknown format values", () => {
    const cells = computeFormatHeatmap([
      makeHistory({ interviewFormat: "unknown_format", scores: { logic: 4 } }),
    ]);
    // all sampleSize should stay at 0
    expect(cells.every((c) => c.sampleSize === 0)).toBe(true);
  });
});

describe("computeRecurringIssues", () => {
  it("returns empty for empty input", () => {
    expect(computeRecurringIssues([], 5)).toEqual([]);
  });

  it("counts keyword frequencies across improvements and picks top N", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ improvements: ["具体性が不足しています", "論理の流れを整理してください"] }),
      makeHistory({ improvements: ["具体性の根拠を数値で示してください"] }),
      makeHistory({ improvements: ["論理の飛躍があります"] }),
    ];
    const issues = computeRecurringIssues(histories, 5);
    const keywords = issues.map((i) => i.keyword);
    expect(keywords).toContain("具体性");
    const specificEntry = issues.find((i) => i.keyword === "具体性");
    expect(specificEntry?.count).toBe(2);
  });

  it("respects the topN limit", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ improvements: ["alpha beta gamma delta epsilon zeta"] }),
    ];
    const issues = computeRecurringIssues(histories, 3);
    expect(issues.length).toBeLessThanOrEqual(3);
  });

  it("dedupes keywords within the same bullet", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ improvements: ["alpha alpha alpha"] }),
    ];
    const issues = computeRecurringIssues(histories, 5);
    const alpha = issues.find((i) => i.keyword === "alpha");
    expect(alpha?.count).toBe(1);
  });
});

describe("buildInterviewDashboardPayload", () => {
  it("assembles all four sections and reports totalSessions", () => {
    const histories: InterviewHistoryRow[] = [
      makeHistory({ companyName: "Alpha", improvements: ["具体性が足りません"] }),
      makeHistory({ companyName: "Beta", improvements: ["論理が弱い"] }),
    ];
    const payload = buildInterviewDashboardPayload(histories);
    expect(payload.totalSessions).toBe(2);
    expect(payload.trendSeries.length).toBeGreaterThan(0);
    expect(payload.companyHeatmap.length).toBe(14);
    expect(payload.formatHeatmap.length).toBe(28);
    expect(payload.recurringIssues.length).toBeGreaterThan(0);
  });
});
