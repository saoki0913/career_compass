import { describe, expect, it } from "vitest";

import {
  safeParseConversationContext,
  resolveDraftReadyState,
  mergeDraftReadyContext,
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
});
