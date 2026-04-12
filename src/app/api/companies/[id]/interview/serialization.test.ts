import { describe, expect, it } from "vitest";

import {
  normalizeInterviewPlanValue,
  validateInterviewMessages,
  validateInterviewTurnState,
} from "./serialization";

describe("interview/serialization", () => {
  it("normalizes legacy interview plan keys", () => {
    expect(
      normalizeInterviewPlanValue({
        interview_type: "case",
        priority_topics: ["motivation", "gakuchika"],
        opening_topic: "自己紹介",
        must_cover_topics: ["role-fit"],
        risk_topics: ["consistency"],
        suggested_timeflow: ["intro", "deep-dive"],
      }),
    ).toEqual({
      interviewType: "case",
      priorityTopics: ["motivation", "gakuchika"],
      openingTopic: "自己紹介",
      mustCoverTopics: ["role-fit"],
      riskTopics: ["consistency"],
      suggestedTimeflow: ["intro", "deep-dive"],
    });
  });

  it("rejects invalid interview messages", () => {
    expect(validateInterviewMessages([{ role: "system", content: "x" }])).toBeNull();
  });

  it("normalizes interview turn state objects", () => {
    const state = validateInterviewTurnState({
      turnCount: 2,
      currentTopic: "自己紹介",
      coveredTopics: ["自己紹介"],
      remainingTopics: ["志望動機"],
      coverageState: [],
      nextAction: "continue",
      formatPhase: "intro",
    });

    expect(state).toMatchObject({
      turnCount: 2,
      currentTopic: "自己紹介",
      coveredTopics: ["自己紹介"],
      remainingTopics: ["志望動機"],
      nextAction: "ask",
    });
  });
});
