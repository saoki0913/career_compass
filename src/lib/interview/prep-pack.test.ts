import { describe, expect, it } from "vitest";

import { buildPrepPackSections } from "./prep-pack";
import type { FeedbackHistoryItem, MaterialCard } from "./ui";
import type { InterviewPlan } from "./plan";

function makeFeedback(overrides: Partial<FeedbackHistoryItem> = {}): FeedbackHistoryItem {
  return {
    id: "fb-1",
    overallComment: "",
    scores: {},
    strengths: [],
    improvements: [],
    consistencyRisks: [],
    weakestQuestionType: null,
    weakestTurnId: null,
    weakestQuestionSnapshot: null,
    weakestAnswerSnapshot: null,
    improvedAnswer: "",
    nextPreparation: [],
    premiseConsistency: 0,
    satisfactionScore: null,
    sourceQuestionCount: 0,
    createdAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildPrepPackSections", () => {
  it("returns all empty arrays when inputs are empty", () => {
    const sections = buildPrepPackSections({
      materials: [],
      interviewPlan: null,
      recentFeedbackHistories: [],
    });
    expect(sections).toEqual({
      likelyTopics: [],
      mustCoverTopics: [],
      motivationConnections: [],
    });
  });

  it("extracts likelyTopics from company and industry seeds and feedback", () => {
    const materials: MaterialCard[] = [
      { label: "企業固有論点", kind: "company_seed", text: "組織文化 / 成長機会 / プロダクト" },
      { label: "業界共通論点", kind: "industry_seed", text: "業界動向 / 競合比較" },
    ];
    const feedback = [
      makeFeedback({ improvements: ["具体性を上げる", "数字で語る"] }),
    ];
    const sections = buildPrepPackSections({
      materials,
      interviewPlan: null,
      recentFeedbackHistories: feedback,
    });
    expect(sections.likelyTopics).toContain("組織文化");
    expect(sections.likelyTopics).toContain("業界動向");
    // capped at 5
    expect(sections.likelyTopics.length).toBeLessThanOrEqual(5);
  });

  it("extracts must_cover_topics from plan", () => {
    const plan = {
      must_cover_topics: ["志望動機", "強み", "入社後"],
    } as unknown as InterviewPlan;
    const sections = buildPrepPackSections({
      materials: [],
      interviewPlan: plan,
      recentFeedbackHistories: [],
    });
    expect(sections.mustCoverTopics).toEqual(["志望動機", "強み", "入社後"]);
  });

  it("uses motivation summary as fallback when no plan hooks exist", () => {
    const sections = buildPrepPackSections({
      materials: [],
      interviewPlan: null,
      recentFeedbackHistories: [],
      motivationSummary: "事業との接続がある志望動機",
    });
    expect(sections.motivationConnections).toHaveLength(1);
    expect(sections.motivationConnections[0]).toContain("事業との接続");
  });

  it("dedupes topic values across materials and feedback improvements", () => {
    const sections = buildPrepPackSections({
      materials: [
        { label: "企業固有論点", kind: "company_seed", text: "組織文化 / 組織文化" },
      ],
      interviewPlan: null,
      recentFeedbackHistories: [makeFeedback({ improvements: ["組織文化"] })],
    });
    expect(sections.likelyTopics.filter((t) => t === "組織文化")).toHaveLength(1);
  });
});
