import { describe, expect, it } from "vitest";

import {
  INTERVIEW_FORMAT_OPTIONS,
  INTERVIEW_STAGE_OPTIONS,
  INTERVIEWER_TYPE_OPTIONS,
  ROLE_TRACK_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
  canonicalizeInterviewFormat,
  classifyInterviewRoleTrack,
  createInitialInterviewTurnState,
  labelTopic,
  normalizeInterviewPlanValue,
  normalizeInterviewTurnState,
  parseInterviewFormatParam,
  shouldChargeInterviewSession,
} from "./session";

describe("interview session helpers", () => {
  it("exposes the v2 interview setup option catalogs", () => {
    expect(ROLE_TRACK_OPTIONS).toContain("biz_general");
    expect(ROLE_TRACK_OPTIONS).toContain("frontend_engineer");
    expect(ROLE_TRACK_OPTIONS).toContain("quant_finance");
    expect(INTERVIEW_FORMAT_OPTIONS).toEqual([
      "standard_behavioral",
      "case",
      "technical",
      "life_history",
    ]);
    expect(SELECTION_TYPE_OPTIONS).toEqual(["internship", "fulltime"]);
    expect(INTERVIEW_STAGE_OPTIONS).toEqual(["early", "mid", "final"]);
    expect(INTERVIEWER_TYPE_OPTIONS).toEqual(["hr", "line_manager", "executive", "mixed_panel"]);
    expect(STRICTNESS_MODE_OPTIONS).toEqual(["supportive", "standard", "strict"]);
  });

  it("creates an initial interview turn state for the plan-driven flow", () => {
    expect(createInitialInterviewTurnState()).toEqual({
      turnCount: 0,
      currentTopic: null,
      coverageState: [],
      coveredTopics: [],
      remainingTopics: [],
      recentQuestionSummariesV2: [],
      formatPhase: "opening",
      lastQuestion: null,
      lastAnswer: null,
      lastTopic: null,
      currentTurnMeta: null,
      nextAction: "ask",
    });
  });

  it("converts internal topic keys to Japanese display labels", () => {
    expect(labelTopic("motivation_fit")).toBe("志望動機");
    expect(labelTopic("technical_depth")).toBe("技術力");
    expect(labelTopic("pressure_followup")).toBe("圧迫深掘り");
    expect(labelTopic("experience")).toBe("経験・ガクチカ");
    expect(labelTopic("company_understanding")).toBe("企業理解");
    expect(labelTopic("志望動機")).toBe("志望動機");
    expect(labelTopic("unknown_key")).toBe("unknown key");
  });

  it("normalizes v2.1 turn state and derives covered topics from deterministic coverage", () => {
    expect(
      normalizeInterviewTurnState({
        turnCount: 3,
        currentTopic: "motivation_fit",
        coverageState: [
          {
            topic: "motivation_fit",
            status: "covered",
            requiredChecklist: ["company_reason", "experience_link"],
            passedChecklistKeys: ["company_reason", "experience_link"],
            deterministicCoveragePassed: true,
            llmCoverageHint: "strong",
            deepeningCount: 2,
            lastCoveredTurnId: "turn-2",
          },
          {
            topic: "company_compare",
            status: "active",
            requiredChecklist: ["compare_axis"],
            passedChecklistKeys: [],
            deterministicCoveragePassed: false,
            llmCoverageHint: "partial",
            deepeningCount: 1,
            lastCoveredTurnId: null,
          },
        ],
        recentQuestionSummariesV2: [
          {
            intentKey: "motivation_fit:company_reason_check",
            normalizedSummary: "会社を選ぶ理由の深掘り",
            topic: "motivation_fit",
            followupStyle: "company_reason_check",
            turnId: "turn-2",
          },
        ],
        formatPhase: "case_main",
        nextAction: "feedback",
      }),
    ).toMatchObject({
      turnCount: 3,
      currentTopic: "motivation_fit",
      coveredTopics: ["motivation_fit"],
      coverageState: [
        expect.objectContaining({
          topic: "motivation_fit",
          deterministicCoveragePassed: true,
          passedChecklistKeys: ["company_reason", "experience_link"],
        }),
        expect.objectContaining({
          topic: "company_compare",
          deterministicCoveragePassed: false,
        }),
      ],
      recentQuestionSummariesV2: [
        expect.objectContaining({
          intentKey: "motivation_fit:company_reason_check",
          followupStyle: "company_reason_check",
        }),
      ],
      formatPhase: "case_main",
      nextAction: "feedback",
    });
  });

  it("charges only after final feedback completes", () => {
    expect(shouldChargeInterviewSession(false)).toBe(false);
    expect(shouldChargeInterviewSession(true)).toBe(true);
  });

  it("maps legacy discussion/presentation to life_history", () => {
    expect(canonicalizeInterviewFormat("discussion")).toBe("life_history");
    expect(canonicalizeInterviewFormat("presentation")).toBe("life_history");
    expect(parseInterviewFormatParam("discussion")).toBe("life_history");
    expect(parseInterviewFormatParam("bogus")).toBe(null);
  });

  it("normalizes legacy formatPhase to life_history_main", () => {
    const legacyTurnState = {
      formatPhase: "discussion_main",
      nextAction: "ask",
    } as unknown as Parameters<typeof normalizeInterviewTurnState>[0];

    expect(
      normalizeInterviewTurnState(legacyTurnState),
    ).toMatchObject({ formatPhase: "life_history_main" });
  });

  it("normalizes interview plans from legacy snake_case payloads", () => {
    expect(
      normalizeInterviewPlanValue({
        interview_type: "case",
        priority_topics: ["structured_thinking"],
        opening_topic: "structured_thinking",
        must_cover_topics: ["structured_thinking", "prioritization"],
        risk_topics: ["logic"],
        suggested_timeflow: ["導入", "構造化", "優先順位"],
      }),
    ).toEqual({
      interviewType: "case",
      priorityTopics: ["structured_thinking"],
      openingTopic: "structured_thinking",
      mustCoverTopics: ["structured_thinking", "prioritization"],
      riskTopics: ["logic"],
      suggestedTimeflow: ["導入", "構造化", "優先順位"],
    });
  });

  it("classifies technical roles with finer-grained internal tracks", () => {
    expect(classifyInterviewRoleTrack("フロントエンドエンジニア")).toBe("frontend_engineer");
    expect(classifyInterviewRoleTrack("Backend Engineer")).toBe("backend_engineer");
    expect(classifyInterviewRoleTrack("データサイエンティスト")).toBe("data_ai");
    expect(classifyInterviewRoleTrack("SRE")).toBe("infra_platform");
    expect(classifyInterviewRoleTrack("Product Manager")).toBe("product_manager");
  });
});
