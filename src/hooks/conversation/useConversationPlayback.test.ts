import { describe, expect, it } from "vitest";

import { shouldCommitConversationPlayback } from "./useConversationPlayback";

describe("shouldCommitConversationPlayback", () => {
  it("returns true only when pending data exists, streaming is active, and playback is complete", () => {
    expect(
      shouldCommitConversationPlayback({
        pendingCompleteData: { nextQuestion: "次の質問" },
        isTextStreaming: true,
        isPlaybackComplete: true,
      }),
    ).toBe(true);
  });

  it("returns false when any prerequisite is missing", () => {
    expect(
      shouldCommitConversationPlayback({
        pendingCompleteData: null,
        isTextStreaming: true,
        isPlaybackComplete: true,
      }),
    ).toBe(false);

    expect(
      shouldCommitConversationPlayback({
        pendingCompleteData: { nextQuestion: "次の質問" },
        isTextStreaming: false,
        isPlaybackComplete: true,
      }),
    ).toBe(false);

    expect(
      shouldCommitConversationPlayback({
        pendingCompleteData: { nextQuestion: "次の質問" },
        isTextStreaming: true,
        isPlaybackComplete: false,
      }),
    ).toBe(false);
  });
});
