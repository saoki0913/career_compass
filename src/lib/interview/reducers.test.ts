/**
 * reducers.test.ts — SSE `complete` payload merge reducers の純関数ユニットテスト。
 *
 * 対象: src/lib/interview/reducers.ts
 * Hook 側 (useInterviewConversationController) の統合テストは対象外。ここでは
 * state 変換ロジックのみ検証する。
 */

import { describe, expect, it } from "vitest";

import type { InterviewStageStatus, InterviewTurnState } from "@/lib/interview/session";
import type { Feedback, FeedbackHistoryItem, Message } from "@/lib/interview/ui";

import {
  mergeCompletePayload,
  mergeContinueCompletePayload,
  mergeFeedbackCompletePayload,
  mergeStartCompletePayload,
  mergeTurnCompletePayload,
  parseCompletePayload,
  type InterviewCompletePayload,
  type InterviewControllerState,
} from "./reducers";

function buildPrevState(overrides: Partial<InterviewControllerState> = {}): InterviewControllerState {
  return {
    messages: [],
    questionCount: 0,
    stageStatus: null,
    questionStage: null,
    feedback: null,
    turnState: null,
    turnMeta: null,
    interviewPlan: null,
    questionFlowCompleted: false,
    creditCost: 6,
    feedbackHistories: [],
    feedbackCompletionCount: 0,
    shortCoaching: null,
    ...overrides,
  };
}

function buildFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    overall_comment: "総評",
    scores: { logic: 4 },
    strengths: ["構造化できている"],
    improvements: ["他社比較を補強する"],
    consistency_risks: [],
    weakest_question_type: null,
    weakest_turn_id: null,
    weakest_question_snapshot: null,
    weakest_answer_snapshot: null,
    improved_answer: "改善例",
    next_preparation: [],
    ...overrides,
  };
}

function buildHistoryItem(id: string, overrides: Partial<FeedbackHistoryItem> = {}): FeedbackHistoryItem {
  return {
    id,
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
    createdAt: "2026-04-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseCompletePayload", () => {
  it("falls back to safe defaults when payload is empty", () => {
    const result = parseCompletePayload({}, 8);
    expect(result).toEqual({
      messages: [],
      questionCount: 0,
      stageStatus: null,
      questionStage: null,
      focus: null,
      feedback: null,
      questionFlowCompleted: false,
      creditCost: 8,
      turnState: null,
      turnMeta: null,
      plan: null,
      feedbackHistories: undefined,
      shortCoaching: null,
    });
  });

  it("uses payload fields when provided and detects questionFlowCompleted via feedback presence", () => {
    const feedback = buildFeedback();
    const result = parseCompletePayload(
      {
        messages: [{ role: "assistant", content: "Q1" }],
        questionCount: 3,
        stageStatus: { label: "中盤", phase: "main" } as unknown as InterviewStageStatus,
        questionStage: "mid",
        focus: "motivation_fit",
        feedback,
        creditCost: 12,
        feedbackHistories: [buildHistoryItem("h1")],
      },
      6,
    );

    expect(result.messages).toEqual([{ role: "assistant", content: "Q1" }]);
    expect(result.questionCount).toBe(3);
    expect(result.questionStage).toBe("mid");
    expect(result.focus).toBe("motivation_fit");
    expect(result.feedback).toBe(feedback);
    expect(result.creditCost).toBe(12);
    expect(result.questionFlowCompleted).toBe(true); // feedback 付与で true
    expect(result.feedbackHistories?.length).toBe(1);
  });

  it("ignores invalid array / number fields gracefully", () => {
    const result = parseCompletePayload(
      {
        messages: "not-an-array" as unknown as Message[],
        questionCount: "3" as unknown as number,
        feedbackHistories: "invalid" as unknown as FeedbackHistoryItem[],
      },
      6,
    );
    expect(result.messages).toEqual([]);
    expect(result.questionCount).toBe(0);
    expect(result.feedbackHistories).toBeUndefined();
  });
});

describe("mergeStartCompletePayload", () => {
  it("overwrites conversation, turn state, and plan from payload (happy path)", () => {
    const prev = buildPrevState();
    const payload: InterviewCompletePayload = {
      messages: [
        { role: "assistant", content: "最初の質問です" },
      ],
      questionCount: 1,
      questionStage: "opening",
      stageStatus: { label: "導入" } as unknown as InterviewStageStatus,
      turnState: { turnCount: 1 } as unknown as InterviewTurnState,
      turnMeta: { intentKey: "opening" } as unknown,
      plan: { phases: [] } as unknown,
      creditCost: 6,
    };

    const next = mergeStartCompletePayload(prev, payload, {
      fallbackCreditCost: 6,
    });

    expect(next.messages).toEqual([{ role: "assistant", content: "最初の質問です" }]);
    expect(next.questionCount).toBe(1);
    expect(next.questionStage).toBe("opening");
    expect(next.interviewPlan).toEqual({ phases: [] });
    expect(next.turnState).toEqual({ turnCount: 1 });
    expect(next.feedbackCompletionCount).toBe(0); // start 時は加算しない
  });

  it("keeps prev.feedbackHistories when payload does not include feedbackHistories", () => {
    const existing = [buildHistoryItem("h-existing")];
    const prev = buildPrevState({ feedbackHistories: existing });
    const next = mergeStartCompletePayload(
      prev,
      { messages: [] },
      { fallbackCreditCost: 6 },
    );
    expect(next.feedbackHistories).toBe(existing); // reference preserved
  });
});

describe("mergeTurnCompletePayload", () => {
  it("replaces messages with payload and updates questionCount", () => {
    const prev = buildPrevState({
      messages: [
        { role: "assistant", content: "Q1" },
        { role: "user", content: "A1" },
      ],
      questionCount: 1,
    });

    const payload: InterviewCompletePayload = {
      messages: [
        { role: "assistant", content: "Q1" },
        { role: "user", content: "A1" },
        { role: "assistant", content: "Q2" },
      ],
      questionCount: 2,
    };

    const next = mergeTurnCompletePayload(prev, payload, { fallbackCreditCost: 6 });
    expect(next.messages).toHaveLength(3);
    expect(next.questionCount).toBe(2);
  });

  it("falls back to creditCost option when payload omits it", () => {
    const prev = buildPrevState({ creditCost: 6 });
    const next = mergeTurnCompletePayload(prev, {}, { fallbackCreditCost: 9 });
    expect(next.creditCost).toBe(9);
  });
});

describe("mergeContinueCompletePayload", () => {
  it("resets feedback to null when payload feedback is absent", () => {
    const prev = buildPrevState({ feedback: buildFeedback() });
    const next = mergeContinueCompletePayload(
      prev,
      { messages: [{ role: "assistant", content: "続きの質問" }] },
      { fallbackCreditCost: 6 },
    );
    expect(next.feedback).toBeNull();
    expect(next.questionFlowCompleted).toBe(false);
  });

  it("does not increment feedbackCompletionCount even if shouldAnnounceFeedback=true", () => {
    const prev = buildPrevState({ feedbackCompletionCount: 2 });
    const next = mergeContinueCompletePayload(
      prev,
      { feedback: buildFeedback() },
      { fallbackCreditCost: 6, shouldAnnounceFeedback: true },
    );
    // continue kind では feedback 完了カウンタを進めない
    expect(next.feedbackCompletionCount).toBe(2);
  });
});

describe("mergeFeedbackCompletePayload", () => {
  it("increments feedbackCompletionCount when feedback is present and announce=true", () => {
    const prev = buildPrevState({ feedbackCompletionCount: 1 });
    const next = mergeFeedbackCompletePayload(
      prev,
      { feedback: buildFeedback() },
      { fallbackCreditCost: 6, shouldAnnounceFeedback: true },
    );
    expect(next.feedbackCompletionCount).toBe(2);
    expect(next.feedback).not.toBeNull();
    expect(next.questionFlowCompleted).toBe(true);
  });

  it("does not increment feedbackCompletionCount when shouldAnnounceFeedback is false", () => {
    const prev = buildPrevState({ feedbackCompletionCount: 5 });
    const next = mergeFeedbackCompletePayload(
      prev,
      { feedback: buildFeedback() },
      { fallbackCreditCost: 6, shouldAnnounceFeedback: false },
    );
    expect(next.feedbackCompletionCount).toBe(5);
  });

  it("replaces feedbackHistories when payload provides an array", () => {
    const prev = buildPrevState({
      feedbackHistories: [buildHistoryItem("old")],
    });
    const nextHistory = [buildHistoryItem("new-1"), buildHistoryItem("new-2")];
    const next = mergeFeedbackCompletePayload(
      prev,
      { feedback: buildFeedback(), feedbackHistories: nextHistory },
      { fallbackCreditCost: 6, shouldAnnounceFeedback: true },
    );
    expect(next.feedbackHistories).toBe(nextHistory);
    expect(next.feedbackHistories.map((item) => item.id)).toEqual(["new-1", "new-2"]);
  });
});

describe("mergeCompletePayload (common)", () => {
  it("returns new controller state object without mutating prev", () => {
    const prev = buildPrevState({
      messages: [{ role: "assistant", content: "unchanged" }],
    });
    const frozenPrev = Object.freeze({ ...prev });
    expect(() =>
      mergeCompletePayload(
        frozenPrev,
        { messages: [{ role: "assistant", content: "new" }] },
        "start",
        { fallbackCreditCost: 6 },
      ),
    ).not.toThrow();
  });

  it("treats null/undefined payload safely and overwrites all scalar fields with defaults", () => {
    const prev = buildPrevState({
      questionCount: 7,
      questionStage: "mid",
      feedback: buildFeedback(),
      questionFlowCompleted: true,
    });
    const next = mergeCompletePayload(prev, null, "send", { fallbackCreditCost: 6 });
    expect(next.questionCount).toBe(0);
    expect(next.questionStage).toBeNull();
    expect(next.feedback).toBeNull();
    expect(next.questionFlowCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Stage 6: short coaching merge behavior
// ---------------------------------------------------------------------------

describe("mergeTurnCompletePayload short_coaching", () => {
  it("writes payload.shortCoaching into state on send kind", () => {
    const prev = buildPrevState();
    const sc = {
      good: "結論先出しできた",
      missing: "数字が不足",
      next_edit: "具体数値を 1 つ入れる",
    };
    const next = mergeTurnCompletePayload(
      prev,
      { messages: [], shortCoaching: sc } as InterviewCompletePayload,
      { fallbackCreditCost: 6 },
    );
    expect(next.shortCoaching).toEqual(sc);
  });

  it("keeps prev.shortCoaching on non-send kinds (start / feedback / continue)", () => {
    const existing = {
      good: "前回の良かった点",
      missing: "前回の足りない観点",
      next_edit: "前回の改善行動",
    };
    const prev = buildPrevState({ shortCoaching: existing });
    const next = mergeStartCompletePayload(
      prev,
      { messages: [] },
      { fallbackCreditCost: 6 },
    );
    expect(next.shortCoaching).toEqual(existing);
  });

  it("returns null for shortCoaching when payload has empty-string fields (初回ターン)", () => {
    const prev = buildPrevState();
    const next = mergeTurnCompletePayload(
      prev,
      {
        messages: [],
        shortCoaching: { good: "", missing: "", next_edit: "" },
      } as InterviewCompletePayload,
      { fallbackCreditCost: 6 },
    );
    expect(next.shortCoaching).toBeNull();
  });

  it("returns null when payload.shortCoaching is malformed", () => {
    const prev = buildPrevState();
    const next = mergeTurnCompletePayload(
      prev,
      { messages: [], shortCoaching: { good: 123 } } as InterviewCompletePayload,
      { fallbackCreditCost: 6 },
    );
    expect(next.shortCoaching).toBeNull();
  });
});
