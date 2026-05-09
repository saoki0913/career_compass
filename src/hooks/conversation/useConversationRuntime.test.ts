import { describe, expect, it } from "vitest";

import type { BaseMessage, ConversationStreamAdapter, StreamEventResult } from "./types";

interface TestDomainState {
  nextQuestion: string;
  questionCount: number;
}

interface TestContext {
  phase: string;
}

function createMockAdapter(
  overrides: Partial<
    ConversationStreamAdapter<TestDomainState, BaseMessage, TestContext>
  > = {},
): ConversationStreamAdapter<TestDomainState, BaseMessage, TestContext> {
  return {
    createStreamContext: () => ({ phase: "init" }),
    fetchStream: async () => new Response(),
    buildOptimisticMessage: (id, content) => ({
      id,
      role: "user" as const,
      content,
    }),
    processSSEEvent: (_event, ctx, _acc) => ({
      action: "noop" as const,
      context: ctx,
    }),
    getPlaybackText: (state) => state.nextQuestion,
    commitState: () => {},
    onError: () => {},
    errorMeta: {
      code: "TEST",
      userMessage: "テスト",
      action: "再試行",
      retryable: true,
      logContext: "test",
    },
    ...overrides,
  };
}

describe("useConversationRuntime adapter contract", () => {
  it("createStreamContext returns typed context", () => {
    const adapter = createMockAdapter();
    const ctx = adapter.createStreamContext();
    expect(ctx.phase).toBe("init");
  });

  it("processSSEEvent returns new context without mutation", () => {
    const adapter = createMockAdapter({
      processSSEEvent: (_event, ctx, _acc) => ({
        action: "set_progress",
        label: "processing",
        context: { ...ctx, phase: "processing" },
      }),
    });

    const initial = adapter.createStreamContext();
    const result = adapter.processSSEEvent(
      { type: "progress" },
      initial,
      { streamedQuestionText: "", startedPlayback: false },
    );

    expect(initial.phase).toBe("init");
    expect(result.context.phase).toBe("processing");
    expect(result.action).toBe("set_progress");
  });

  it("processSSEEvent complete returns typed domain state", () => {
    const adapter = createMockAdapter({
      processSSEEvent: (_event, ctx, _acc) => ({
        action: "complete",
        domainState: { nextQuestion: "次の質問", questionCount: 3 },
        playbackText: "次の質問",
        context: ctx,
      }),
    });

    const result = adapter.processSSEEvent(
      { type: "complete" },
      { phase: "init" },
      { streamedQuestionText: "", startedPlayback: false },
    );

    if (result.action === "complete") {
      expect(result.domainState.nextQuestion).toBe("次の質問");
      expect(result.domainState.questionCount).toBe(3);
      expect(result.playbackText).toBe("次の質問");
    }
  });

  it("accumulate_chunk preserves context and carries text", () => {
    const adapter = createMockAdapter({
      processSSEEvent: (_event, ctx, _acc) => ({
        action: "accumulate_chunk",
        text: "chunk",
        context: { ...ctx, phase: "buffering" },
      }),
    });

    const result = adapter.processSSEEvent(
      { type: "string_chunk", text: "chunk" },
      { phase: "init" },
      { streamedQuestionText: "", startedPlayback: false },
    );

    expect(result.action).toBe("accumulate_chunk");
    if (result.action === "accumulate_chunk") {
      expect(result.text).toBe("chunk");
    }
    expect(result.context.phase).toBe("buffering");
  });

  it("buildOptimisticMessage creates BaseMessage-compatible object", () => {
    const adapter = createMockAdapter();
    const msg = adapter.buildOptimisticMessage("opt-1", "test answer");
    expect(msg.id).toBe("opt-1");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("test answer");
  });

  it("getPlaybackText extracts text from domain state", () => {
    const adapter = createMockAdapter();
    expect(adapter.getPlaybackText({ nextQuestion: "Q1", questionCount: 1 })).toBe("Q1");
  });

  it("error result narrows correctly", () => {
    const result: StreamEventResult<TestDomainState, TestContext> = {
      action: "error",
      message: "stream error",
      context: { phase: "init" },
    };

    if (result.action === "error") {
      expect(result.message).toBe("stream error");
    }
  });

  it("adapter with void TContext works", () => {
    const adapter: ConversationStreamAdapter<TestDomainState, BaseMessage> = {
      createStreamContext: () => undefined as void,
      fetchStream: async () => new Response(),
      buildOptimisticMessage: (id, content) => ({ id, role: "user", content }),
      processSSEEvent: () => ({ action: "noop", context: undefined as void }),
      getPlaybackText: (s) => s.nextQuestion,
      commitState: () => {},
      onError: () => {},
      errorMeta: {
        code: "T",
        userMessage: "t",
        action: "t",
        retryable: false,
        logContext: "t",
      },
    };

    const result = adapter.processSSEEvent(
      { type: "noop" },
      undefined as void,
      { streamedQuestionText: "", startedPlayback: false },
    );
    expect(result.action).toBe("noop");
  });
});
