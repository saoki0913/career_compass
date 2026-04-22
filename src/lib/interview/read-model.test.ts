import { describe, expect, it } from "vitest";

import {
  parseJsonArray,
  parseFeedbackScores,
  parseInterviewPlan,
  validateInterviewMessages,
  validateInterviewTurnState,
  normalizeInterviewPlanValue,
} from "./read-model";

describe("interview read-model parse helpers", () => {
  // -----------------------------------------------------------------------
  // parseJsonArray
  // -----------------------------------------------------------------------
  describe("parseJsonArray", () => {
    it("parses a JSON string array", () => {
      expect(parseJsonArray(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    });

    it("filters non-string elements", () => {
      expect(parseJsonArray([1, "valid", null, "ok"])).toEqual(["valid", "ok"]);
    });

    it("returns empty array for null/undefined", () => {
      expect(parseJsonArray(null)).toEqual([]);
      expect(parseJsonArray(undefined)).toEqual([]);
    });

    it("returns empty array for non-array JSON", () => {
      expect(parseJsonArray(JSON.stringify({ a: 1 }))).toEqual([]);
    });

    it("handles already-parsed arrays (jsonb)", () => {
      expect(parseJsonArray(["x", "y"])).toEqual(["x", "y"]);
    });
  });

  // -----------------------------------------------------------------------
  // parseFeedbackScores
  // -----------------------------------------------------------------------
  describe("parseFeedbackScores", () => {
    it("parses a scores object", () => {
      const scores = { logic: 4, specificity: 3 };
      expect(parseFeedbackScores(scores)).toEqual(scores);
    });

    it("parses a JSON-stringified scores object", () => {
      const scores = { company_fit: 5 };
      expect(parseFeedbackScores(JSON.stringify(scores))).toEqual(scores);
    });

    it("returns empty object for null", () => {
      expect(parseFeedbackScores(null)).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // parseInterviewPlan
  // -----------------------------------------------------------------------
  describe("parseInterviewPlan", () => {
    it("normalizes snake_case keys to camelCase", () => {
      const plan = parseInterviewPlan(
        JSON.stringify({
          interview_type: "case",
          priority_topics: ["motivation"],
          opening_topic: "自己紹介",
          must_cover_topics: [],
          risk_topics: [],
          suggested_timeflow: [],
        }),
      );
      expect(plan).toMatchObject({
        interviewType: "case",
        priorityTopics: ["motivation"],
        openingTopic: "自己紹介",
      });
    });

    it("returns null for null input", () => {
      expect(parseInterviewPlan(null)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // validateInterviewMessages
  // -----------------------------------------------------------------------
  describe("validateInterviewMessages", () => {
    it("accepts valid user/assistant messages", () => {
      expect(
        validateInterviewMessages([
          { role: "user", content: "answer" },
          { role: "assistant", content: "question" },
        ]),
      ).toEqual([
        { role: "user", content: "answer" },
        { role: "assistant", content: "question" },
      ]);
    });

    it("rejects messages with invalid roles", () => {
      expect(
        validateInterviewMessages([{ role: "system", content: "x" }]),
      ).toBeNull();
    });

    it("returns null for non-array input", () => {
      expect(validateInterviewMessages("not-an-array")).toBeNull();
    });

    it("trims message content", () => {
      const result = validateInterviewMessages([
        { role: "user", content: "  padded  " },
      ]);
      expect(result?.[0]?.content).toBe("padded");
    });
  });

  // -----------------------------------------------------------------------
  // validateInterviewTurnState
  // -----------------------------------------------------------------------
  describe("validateInterviewTurnState", () => {
    it("normalizes a partial turn state object", () => {
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

    it("returns null for non-object input", () => {
      expect(validateInterviewTurnState(null)).toBeNull();
      expect(validateInterviewTurnState("string")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // normalizeInterviewPlanValue (re-exported)
  // -----------------------------------------------------------------------
  describe("normalizeInterviewPlanValue", () => {
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
  });
});
