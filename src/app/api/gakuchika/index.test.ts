import { describe, expect, it } from "vitest";

import {
  getGakuchikaNextAction,
  safeParseConversationState,
  serializeConversationState,
  type ConversationState,
} from ".";

describe("api/gakuchika/shared conversation state", () => {
  it("does not infer interview_ready from completed status alone", () => {
    const parsed = safeParseConversationState(null, "completed");

    expect(parsed.stage).toBe("draft_ready");
    expect(parsed.readyForDraft).toBe(true);
    expect(parsed.deepdiveComplete).toBe(false);
    expect(parsed.progressLabel).toBe("ES作成可");
  });

  it("round-trips extended conversation state fields", () => {
    const state: ConversationState = {
      stage: "deep_dive_active",
      focusKey: "action_reason",
      progressLabel: "判断理由を整理中",
      answerHint: "その方法を選んだ根拠を書くと伝わります。",
      inputRichnessMode: "almost_draftable",
      missingElements: [],
      draftQualityChecks: {
        task_clarity: true,
        action_ownership: true,
        role_required: true,
        role_clarity: true,
        result_traceability: true,
        learning_reusability: false,
      },
      causalGaps: ["learning_too_generic"],
      completionChecks: {
        role_confirmed: true,
        action_reason_confirmed: true,
      },
      readyForDraft: true,
      draftReadinessReason: "ES本文の材料は揃っています。",
      draftText: "私は学園祭運営で導線改善に取り組んだ。",
      strengthTags: ["ownership_visible"],
      issueTags: ["learning_generic"],
      deepdiveRecommendationTags: ["deepen_learning_transfer"],
      credibilityRiskTags: [],
      deepdiveStage: "evidence_enhancement",
      deepdiveComplete: false,
      completionReasons: [],
      askedFocuses: ["task", "action", "result_evidence"],
      resolvedFocuses: ["context", "task", "action", "result"],
      deferredFocuses: ["learning"],
      blockedFocuses: ["role"],
      focusAttemptCounts: {
        task: 1,
        action: 2,
        role: 2,
      },
      lastQuestionSignature: "action_reason:v2",
      extendedDeepDiveRound: 2,
    };

    const parsed = safeParseConversationState(serializeConversationState(state));

    expect(parsed.inputRichnessMode).toBe("almost_draftable");
    expect(parsed.draftQualityChecks.role_required).toBe(true);
    expect(parsed.causalGaps).toEqual(["learning_too_generic"]);
    expect(parsed.completionChecks.action_reason_confirmed).toBe(true);
    expect(parsed.deepdiveRecommendationTags).toEqual(["deepen_learning_transfer"]);
    expect(parsed.askedFocuses).toEqual(["task", "action", "result_evidence"]);
    expect(parsed.resolvedFocuses).toEqual(["context", "task", "action", "result"]);
    expect(parsed.deferredFocuses).toEqual(["learning"]);
    expect(parsed.blockedFocuses).toEqual(["role"]);
    expect(parsed.focusAttemptCounts.action).toBe(2);
    expect(parsed.lastQuestionSignature).toBe("action_reason:v2");
    expect(parsed.extendedDeepDiveRound).toBe(2);
  });

  it("derives the next action from the current conversation state", () => {
    expect(
      getGakuchikaNextAction({
        ...safeParseConversationState(null, "completed"),
        draftText: null,
      }),
    ).toBe("show_generate_draft_cta");

    expect(
      getGakuchikaNextAction({
        ...safeParseConversationState(null, "completed"),
        draftText: "draft",
      }),
    ).toBe("continue_deep_dive");

    expect(
      getGakuchikaNextAction({
        ...safeParseConversationState(serializeConversationState({
          ...safeParseConversationState(null, "in_progress"),
          stage: "interview_ready",
          readyForDraft: true,
          progressLabel: "面接準備完了",
          draftText: "draft",
        })),
      }),
    ).toBe("show_interview_ready");
  });
});
