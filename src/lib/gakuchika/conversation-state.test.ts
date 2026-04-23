import { describe, expect, it } from "vitest";

import {
  buildConversationStatePatch,
  getBuildItemStatus,
  safeParseConversationState,
  serializeConversationState,
  type ConversationState,
} from "./conversation-state";

function baseState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    stage: "es_building",
    focusKey: null,
    progressLabel: null,
    answerHint: null,
    inputRichnessMode: null,
    missingElements: ["context", "task", "action", "result"],
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
    readyForDraft: false,
    draftReadinessReason: "",
    draftText: null,
    strengthTags: [],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    deepdiveStage: null,
    deepdiveComplete: false,
    completionReasons: [],
    askedFocuses: [],
    resolvedFocuses: [],
    deferredFocuses: [],
    blockedFocuses: [],
    recentQuestionTexts: [],
    loopBlockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
    coachProgressMessage: null,
    remainingQuestionsEstimate: null,
    ...overrides,
  };
}

describe("getBuildItemStatus", () => {
  it("treats all STAR slots as pending when es_building, no missing, and focusKey is null", () => {
    const state = baseState({
      missingElements: [],
      focusKey: null,
    });
    expect(getBuildItemStatus(state, "context")).toBe("pending");
    expect(getBuildItemStatus(state, "task")).toBe("pending");
    expect(getBuildItemStatus(state, "action")).toBe("pending");
    expect(getBuildItemStatus(state, "result")).toBe("pending");
  });

  it("marks non-focus STAR slots done when missing is empty and focusKey is a STAR key", () => {
    const state = baseState({
      missingElements: [],
      focusKey: "task",
    });
    expect(getBuildItemStatus(state, "context")).toBe("done");
    expect(getBuildItemStatus(state, "task")).toBe("current");
    expect(getBuildItemStatus(state, "action")).toBe("done");
    expect(getBuildItemStatus(state, "result")).toBe("done");
  });

  it("uses first missing STAR as current when focusKey is not a STAR key", () => {
    const state = baseState({
      missingElements: ["task", "result"],
      focusKey: "overview",
    });
    expect(getBuildItemStatus(state, "context")).toBe("done");
    expect(getBuildItemStatus(state, "task")).toBe("current");
    expect(getBuildItemStatus(state, "action")).toBe("done");
    expect(getBuildItemStatus(state, "result")).toBe("pending");
  });

  it("keeps a single current when focusKey matches a STAR key even if earlier missing exists (server should align)", () => {
    const state = baseState({
      missingElements: ["task", "action"],
      focusKey: "action",
    });
    expect(getBuildItemStatus(state, "task")).toBe("pending");
    expect(getBuildItemStatus(state, "action")).toBe("current");
  });
});

describe("conversation-state adapters", () => {
  it("round-trips canonical conversation state through serialize and parse", () => {
    const state = baseState({
      stage: "draft_ready",
      focusKey: "result",
      progressLabel: "ES作成可",
      readyForDraft: true,
      draftText: "私は...",
    });

    expect(safeParseConversationState(serializeConversationState(state), "completed")).toEqual(state);
  });

  it("merges partial patches without dropping array fields", () => {
    const patched = buildConversationStatePatch(
      baseState({
        askedFocuses: ["context"],
        blockedFocuses: ["future"],
      }),
      {
        focusKey: "task",
        askedFocuses: ["context", "task"],
      },
    );

    expect(patched.focusKey).toBe("task");
    expect(patched.askedFocuses).toEqual(["context", "task"]);
    expect(patched.blockedFocuses).toEqual(["future"]);
  });

  it("round-trips recent question loop fields through serialize and parse", () => {
    const state = baseState({
      recentQuestionTexts: ["そのときの課題は何でしたか？", "なぜそう判断しましたか？"],
      loopBlockedFocuses: ["task", "challenge"],
    });

    const parsed = safeParseConversationState(serializeConversationState(state));

    expect(parsed.recentQuestionTexts).toEqual(state.recentQuestionTexts);
    expect(parsed.loopBlockedFocuses).toEqual(state.loopBlockedFocuses);
  });

  it("keeps loop fields when patch does not mention them and replaces them when present", () => {
    const patched = buildConversationStatePatch(
      baseState({
        recentQuestionTexts: ["状況はどうでしたか？"],
        loopBlockedFocuses: ["context"],
      }),
      {
        focusKey: "task",
        recentQuestionTexts: ["課題は何でしたか？"],
      },
    );

    expect(patched.focusKey).toBe("task");
    expect(patched.recentQuestionTexts).toEqual(["課題は何でしたか？"]);
    expect(patched.loopBlockedFocuses).toEqual(["context"]);
  });
});

describe("remainingQuestionsEstimate normalization (M4)", () => {
  it("parses snake_case remaining_questions_estimate into the camelCase field", () => {
    const json = JSON.stringify({
      stage: "es_building",
      remaining_questions_estimate: 3,
    });
    expect(safeParseConversationState(json).remainingQuestionsEstimate).toBe(3);
  });

  it("accepts the camelCase alias for resume payloads", () => {
    const json = JSON.stringify({
      stage: "es_building",
      remainingQuestionsEstimate: 5,
    });
    expect(safeParseConversationState(json).remainingQuestionsEstimate).toBe(5);
  });

  it("coerces negative or non-numeric estimates to null", () => {
    const negative = JSON.stringify({ stage: "es_building", remaining_questions_estimate: -1 });
    const wrongType = JSON.stringify({ stage: "es_building", remaining_questions_estimate: "three" });

    expect(safeParseConversationState(negative).remainingQuestionsEstimate).toBeNull();
    expect(safeParseConversationState(wrongType).remainingQuestionsEstimate).toBeNull();
  });

  it("floors fractional values and keeps zero as a valid value", () => {
    const frac = JSON.stringify({ stage: "es_building", remaining_questions_estimate: 2.9 });
    const zero = JSON.stringify({ stage: "es_building", remaining_questions_estimate: 0 });

    expect(safeParseConversationState(frac).remainingQuestionsEstimate).toBe(2);
    expect(safeParseConversationState(zero).remainingQuestionsEstimate).toBe(0);
  });

  it("round-trips through serialize → parse", () => {
    const state = baseState({
      stage: "es_building",
      remainingQuestionsEstimate: 4,
    });
    expect(
      safeParseConversationState(serializeConversationState(state)).remainingQuestionsEstimate,
    ).toBe(4);
  });

  it("late-wins on null in buildConversationStatePatch to clear the field", () => {
    const patched = buildConversationStatePatch(
      baseState({ remainingQuestionsEstimate: 3 }),
      { remainingQuestionsEstimate: null },
    );
    expect(patched.remainingQuestionsEstimate).toBeNull();
  });

  it("preserves the current value when the patch does not mention the field", () => {
    const patched = buildConversationStatePatch(
      baseState({ remainingQuestionsEstimate: 3 }),
      { focusKey: "task" },
    );
    expect(patched.remainingQuestionsEstimate).toBe(3);
  });

  it("defaults to 0 for legacy completed rows without a stored state JSON", () => {
    const parsed = safeParseConversationState(null, "completed");
    expect(parsed.stage).toBe("draft_ready");
    expect(parsed.remainingQuestionsEstimate).toBe(0);
  });
});
