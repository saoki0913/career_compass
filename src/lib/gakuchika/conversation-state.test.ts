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
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
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
});
