import { describe, expect, it } from "vitest";

import { safeParseConversationContext } from "./conversation";

describe("safeParseConversationContext postDraftAwaitingResume", () => {
  it("preserves postDraftAwaitingResume when set to true", () => {
    const context = safeParseConversationContext({
      postDraftAwaitingResume: true,
      draftReady: true,
    });
    expect(context.postDraftAwaitingResume).toBe(true);
  });

  it("preserves postDraftAwaitingResume when set to false", () => {
    const context = safeParseConversationContext({
      postDraftAwaitingResume: false,
    });
    expect(context.postDraftAwaitingResume).toBe(false);
  });

  it("returns undefined when postDraftAwaitingResume is not present", () => {
    const context = safeParseConversationContext({
      conversationMode: "slot_fill",
    });
    expect(context.postDraftAwaitingResume).toBeUndefined();
  });
});
