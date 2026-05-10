import { describe, expect, it } from "vitest";

import type {
  BaseMessage,
  ConversationStreamAdapter,
  StreamAccumulator,
  StreamErrorMeta,
  StreamEventResult,
} from "./types";


describe("conversation/types", () => {
  it("BaseMessage satisfies minimum shape", () => {
    const msg: BaseMessage = {
      id: "1",
      role: "user",
      content: "hello",
    };
    expect(msg.role).toBe("user");
    expect(msg.isOptimistic).toBeUndefined();
  });

  it("BaseMessage accepts optional isOptimistic", () => {
    const msg: BaseMessage = {
      id: "1",
      role: "assistant",
      content: "hi",
      isOptimistic: true,
    };
    expect(msg.isOptimistic).toBe(true);
  });

  it("StreamEventResult discriminated union narrows correctly", () => {
    const noop: StreamEventResult<{ x: number }, string> = {
      action: "noop",
      context: "ctx",
    };
    expect(noop.action).toBe("noop");

    const complete: StreamEventResult<{ x: number }, string> = {
      action: "complete",
      domainState: { x: 42 },
      playbackText: "text",
      context: "ctx",
    };
    if (complete.action === "complete") {
      expect(complete.domainState.x).toBe(42);
      expect(complete.playbackText).toBe("text");
    }
  });

  it("StreamAccumulator is readonly", () => {
    const acc: StreamAccumulator = {
      streamedQuestionText: "hello",
      startedPlayback: false,
    };
    expect(acc.streamedQuestionText).toBe("hello");
  });

  it("StreamErrorMeta satisfies shape", () => {
    const meta: StreamErrorMeta = {
      code: "TEST_ERROR",
      userMessage: "msg",
      action: "retry",
      retryable: true,
      logContext: "test",
    };
    expect(meta.retryable).toBe(true);
  });

  it("ConversationStreamAdapter type is assignable with void TContext", () => {
    const _adapter: ConversationStreamAdapter<
      { question: string },
      BaseMessage
    > = {
      createStreamContext: () => undefined as void,
      fetchStream: async () => new Response(),
      buildOptimisticMessage: (id, content) => ({
        id,
        role: "user",
        content,
      }),
      processSSEEvent: (_event, _ctx, _acc) => ({
        action: "noop" as const,
        context: undefined as void,
      }),
      getPlaybackText: (state) => state.question,
      commitState: () => {},
      onError: () => {},
      errorMeta: {
        code: "TEST",
        userMessage: "test",
        action: "retry",
        retryable: true,
        logContext: "test",
      },
    };
    expect(_adapter.errorMeta.code).toBe("TEST");
  });

  it("ConversationStreamAdapter type is assignable with typed TContext", () => {
    interface TestContext {
      phase: string;
    }
    const _adapter: ConversationStreamAdapter<
      { question: string },
      BaseMessage,
      TestContext
    > = {
      createStreamContext: () => ({ phase: "init" }),
      fetchStream: async () => new Response(),
      buildOptimisticMessage: (id, content) => ({
        id,
        role: "user",
        content,
      }),
      processSSEEvent: (_event, ctx, _acc) => ({
        action: "set_progress" as const,
        label: ctx.phase,
        context: { phase: "next" },
      }),
      getPlaybackText: (state) => state.question,
      commitState: (_state, ctx) => {
        expect(ctx.phase).toBeDefined();
      },
      onError: () => {},
      errorMeta: {
        code: "TEST",
        userMessage: "test",
        action: "retry",
        retryable: true,
        logContext: "test",
      },
    };
    expect(_adapter.createStreamContext().phase).toBe("init");
  });
});
