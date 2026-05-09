import { describe, expect, it } from "vitest";

describe("conversation barrel exports", () => {
  it("exports types from types.ts", async () => {
    const mod = await import("./index");
    expect(mod).toBeDefined();
  });

  it("exports useConversationRuntime", async () => {
    const mod = await import("./index");
    expect(typeof mod.useConversationRuntime).toBe("function");
  });

  it("exports useConversationPlayback", async () => {
    const mod = await import("./index");
    expect(typeof mod.useConversationPlayback).toBe("function");
  });

  it("exports parseSSEStream", async () => {
    const mod = await import("./index");
    expect(typeof mod.parseSSEStream).toBe("function");
  });

  it("exports optimistic message utilities", async () => {
    const mod = await import("./index");
    expect(typeof mod.appendOptimisticUserMessage).toBe("function");
    expect(typeof mod.rollbackOptimisticMessageById).toBe("function");
  });

  it("exports createStreamTimeout", async () => {
    const mod = await import("./index");
    expect(typeof mod.createStreamTimeout).toBe("function");
  });
});
