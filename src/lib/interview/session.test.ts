import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERVIEW_QUESTION_COUNT,
  INTERVIEW_MAX_QUESTION_COUNT,
  INTERVIEW_MIN_QUESTION_COUNT,
  INTERVIEW_STAGE_ORDER,
  createInitialInterviewTurnState,
  getInterviewStageStatus,
  getInterviewTrackerStatus,
  shouldChargeInterviewSession,
} from "./session";

describe("interview session helpers", () => {
  it("uses adaptive interview question bounds", () => {
    expect(DEFAULT_INTERVIEW_QUESTION_COUNT).toBe(10);
    expect(INTERVIEW_MIN_QUESTION_COUNT).toBe(10);
    expect(INTERVIEW_MAX_QUESTION_COUNT).toBe(15);
    expect(INTERVIEW_STAGE_ORDER).toEqual([
      "industry_reason",
      "role_reason",
      "opening",
      "experience",
      "company_understanding",
      "motivation_fit",
      "feedback",
    ]);
  });

  it("creates an initial interview turn state for the industry reason question", () => {
    expect(createInitialInterviewTurnState()).toEqual({
      currentStage: "industry_reason",
      totalQuestionCount: 0,
      stageQuestionCounts: {
        industry_reason: 0,
        role_reason: 0,
        opening: 0,
        experience: 0,
        company_understanding: 0,
        motivation_fit: 0,
      },
      completedStages: [],
      lastQuestionFocus: null,
      nextAction: "ask",
    });
  });

  it("computes stage status from the active stage", () => {
    expect(getInterviewStageStatus("industry_reason")).toEqual({
      current: "industry_reason",
      completed: [],
      pending: ["role_reason", "opening", "experience", "company_understanding", "motivation_fit", "feedback"],
    });
    expect(getInterviewStageStatus("experience")).toEqual({
      current: "experience",
      completed: ["industry_reason", "role_reason", "opening"],
      pending: ["company_understanding", "motivation_fit", "feedback"],
    });
    expect(getInterviewStageStatus("feedback")).toEqual({
      current: "feedback",
      completed: ["industry_reason", "role_reason", "opening", "experience", "company_understanding", "motivation_fit"],
      pending: [],
    });
  });

  it("reports tracker copy for adaptive progress within a stage", () => {
    expect(
      getInterviewTrackerStatus({
        totalQuestionCount: 7,
        currentStage: "experience",
        currentStageQuestionCount: 2,
      }),
    ).toEqual({
      headline: "7 / 15問",
      detail: "経験・ガクチカを深掘り中 2問目",
    });
  });

  it("charges only after final feedback completes", () => {
    expect(shouldChargeInterviewSession(false)).toBe(false);
    expect(shouldChargeInterviewSession(true)).toBe(true);
  });
});
