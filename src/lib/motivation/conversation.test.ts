import { describe, expect, it } from "vitest";

import {
  safeParseConversationContext,
  resolveDraftReadyState,
  mergeDraftReadyContext,
  safeParseStageStatus,
} from "./conversation";

describe("motivation conversation draft readiness", () => {
  it("prefers persisted draftReady in conversationContext over legacy status", () => {
    const context = safeParseConversationContext(JSON.stringify({ draftReady: false }));

    expect(resolveDraftReadyState(context, "completed")).toEqual({
      isDraftReady: false,
      unlockedAt: null,
    });
  });

  it("falls back to legacy completed status when draftReady is not persisted", () => {
    const context = safeParseConversationContext(JSON.stringify({ questionStage: "fit_connection" }));

    expect(resolveDraftReadyState(context, "completed")).toEqual({
      isDraftReady: true,
      unlockedAt: null,
    });
  });

  it("keeps draftReady sticky once unlocked", () => {
    const context = safeParseConversationContext(JSON.stringify({
      draftReady: true,
      draftReadyUnlockedAt: "2026-03-29T09:00:00.000Z",
    }));

    expect(mergeDraftReadyContext(context, false)).toMatchObject({
      draftReady: true,
      draftReadyUnlockedAt: "2026-03-29T09:00:00.000Z",
    });
  });

  it("defaults to the new six-slot open state", () => {
    const context = safeParseConversationContext(null);

    expect(context.openSlots).toEqual([
      "industry_reason",
      "company_reason",
      "self_connection",
      "desired_work",
      "value_contribution",
      "differentiation",
    ]);
  });

  it("derives stage status from six-slot confirmed facts", () => {
    const context = safeParseConversationContext(JSON.stringify({
      questionStage: "desired_work",
      confirmedFacts: {
        industry_reason_confirmed: true,
        company_reason_confirmed: true,
        self_connection_confirmed: true,
        desired_work_confirmed: false,
        value_contribution_confirmed: false,
        differentiation_confirmed: false,
      },
    }));

    expect(safeParseStageStatus(null, context)).toEqual({
      current: "desired_work",
      completed: ["industry_reason", "company_reason", "self_connection"],
      pending: ["value_contribution", "differentiation"],
    });
  });

  it("accepts structured jsonb values without stringifying first", () => {
    const context = safeParseConversationContext({
      questionStage: "desired_work",
      draftReady: true,
    });

    expect(context.questionStage).toBe("desired_work");
    expect(context.draftReady).toBe(true);
  });

  it("defaults postDraftAwaitingResume to undefined when not set", () => {
    const context = safeParseConversationContext(null);
    expect(context.postDraftAwaitingResume).toBeUndefined();
  });

  it("preserves postDraftAwaitingResume when explicitly set", () => {
    const context = safeParseConversationContext({
      postDraftAwaitingResume: true,
      draftReady: true,
    });
    expect(context.postDraftAwaitingResume).toBe(true);
  });
});
