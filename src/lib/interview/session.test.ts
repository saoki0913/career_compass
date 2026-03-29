import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERVIEW_QUESTION_COUNT,
  INTERVIEW_STAGE_ORDER,
  getInterviewQuestionStage,
  getInterviewStageStatus,
  shouldChargeInterviewSession,
} from "./session";

describe("interview session helpers", () => {
  it("uses five fixed interview questions", () => {
    expect(DEFAULT_INTERVIEW_QUESTION_COUNT).toBe(5);
    expect(INTERVIEW_STAGE_ORDER).toEqual([
      "opening",
      "company_understanding",
      "experience",
      "motivation_fit",
      "feedback",
    ]);
  });

  it("maps question count to the fixed interview stage flow", () => {
    expect(getInterviewQuestionStage(1)).toBe("opening");
    expect(getInterviewQuestionStage(2)).toBe("company_understanding");
    expect(getInterviewQuestionStage(3)).toBe("experience");
    expect(getInterviewQuestionStage(4)).toBe("motivation_fit");
    expect(getInterviewQuestionStage(5)).toBe("motivation_fit");
    expect(getInterviewQuestionStage(6)).toBe("feedback");
    expect(getInterviewQuestionStage(99)).toBe("feedback");
  });

  it("computes stage status for the active question and final feedback", () => {
    expect(getInterviewStageStatus(1, false)).toEqual({
      current: "opening",
      completed: [],
      pending: ["company_understanding", "experience", "motivation_fit", "feedback"],
    });
    expect(getInterviewStageStatus(3, false)).toEqual({
      current: "experience",
      completed: ["opening", "company_understanding"],
      pending: ["motivation_fit", "feedback"],
    });
    expect(getInterviewStageStatus(5, false)).toEqual({
      current: "motivation_fit",
      completed: ["opening", "company_understanding", "experience"],
      pending: ["feedback"],
    });
    expect(getInterviewStageStatus(5, true)).toEqual({
      current: "feedback",
      completed: ["opening", "company_understanding", "experience", "motivation_fit"],
      pending: [],
    });
  });

  it("charges only after final feedback completes", () => {
    expect(shouldChargeInterviewSession(false)).toBe(false);
    expect(shouldChargeInterviewSession(true)).toBe(true);
  });
});
