import { describe, expect, it, vi } from "vitest";
import { createSSEProxyStream, type SSEProxyOptions } from "./sse-proxy";

function makeSSEBodyFromObjects(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.close();
    },
  });
}

function fakeResponse(events: Record<string, unknown>[]): Response {
  return { body: makeSSEBodyFromObjects(events) } as unknown as Response;
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const line = block.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (json) events.push(JSON.parse(json));
    }
  }
  return events;
}

describe("createSSEProxyStream", () => {
  const baseOpts: Pick<SSEProxyOptions, "feature" | "requestId"> = {
    feature: "test",
    requestId: "req-1",
  };

  it("forwards progress events to the client", async () => {
    const upstream = fakeResponse([
      { type: "progress", message: "thinking..." },
      { type: "string_chunk", text: "hello" },
      { type: "complete", data: { result: "ok" } },
    ]);

    const stream = createSSEProxyStream(upstream, baseOpts);
    const events = await collectEvents(stream);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "progress", message: "thinking..." });
    expect(events[1]).toEqual({ type: "string_chunk", text: "hello" });
    expect(events[2]).toEqual({ type: "complete", data: { result: "ok" } });
  });

  it("calls onComplete on complete event and forwards replaced payload", async () => {
    const upstream = fakeResponse([
      { type: "progress", message: "working" },
      { type: "complete", data: { raw: true } },
    ]);
    const onComplete = vi.fn().mockResolvedValue({
      replaceEvent: { type: "complete", data: { enriched: true, extra: "field" } },
    });

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete });
    const events = await collectEvents(stream);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith({ type: "complete", data: { raw: true } });
    expect(events[1]).toEqual({ type: "complete", data: { enriched: true, extra: "field" } });
  });

  it("does not call onComplete on error events — calls onError instead", async () => {
    const upstream = fakeResponse([
      { type: "error", message: "something failed" },
    ]);
    const onComplete = vi.fn();
    const onError = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onError });
    const events = await collectEvents(stream);

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith({ type: "error", message: "something failed" });
    expect(events[0]).toEqual({ type: "error", message: "something failed" });
  });

  it("preserves sanitized FastAPI error metadata on error events", async () => {
    const upstream = fakeResponse([
      {
        type: "error",
        message: "tenant key is not configured",
        error_type: "tenant_key_not_configured",
        status_code: 503,
        internal_telemetry: { input_tokens: 1, output_tokens: 0 },
      },
    ]);
    const onCostTelemetry = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onCostTelemetry });
    const events = await collectEvents(stream);

    expect(events[0]).toEqual({
      type: "error",
      message: "tenant key is not configured",
      error_type: "tenant_key_not_configured",
      status_code: 503,
    });
    expect(onCostTelemetry).toHaveBeenCalledOnce();
  });

  it("strips internal_telemetry before forwarding to client", async () => {
    const upstream = fakeResponse([
      {
        type: "progress",
        message: "step 1",
        internal_telemetry: { model: "gpt-4", input_tokens: 100, output_tokens: 50 },
      },
      {
        type: "complete",
        data: { result: "done" },
        internal_telemetry: { model: "gpt-4", input_tokens: 200, output_tokens: 100 },
      },
    ]);
    const onCostTelemetry = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onCostTelemetry });
    const events = await collectEvents(stream);

    for (const event of events) {
      expect(event).not.toHaveProperty("internal_telemetry");
    }
    expect(onCostTelemetry).toHaveBeenCalledTimes(2);
    expect(onCostTelemetry.mock.calls[0][0]).toMatchObject({ model: "gpt-4", input_tokens: 100 });
  });

  it("invokes onFinally with success=true after complete event", async () => {
    const upstream = fakeResponse([
      { type: "complete", data: {} },
    ]);
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onFinally });
    await collectEvents(stream);

    expect(onFinally).toHaveBeenCalledOnce();
    expect(onFinally).toHaveBeenCalledWith({ success: true });
  });

  it("invokes onFinally with success=false when only error events received", async () => {
    const upstream = fakeResponse([
      { type: "error", message: "fail" },
    ]);
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onFinally });
    await collectEvents(stream);

    expect(onFinally).toHaveBeenCalledOnce();
    expect(onFinally).toHaveBeenCalledWith({ success: false });
  });

  it("invokes onFinally exactly once even with cancel", async () => {
    const upstream = fakeResponse([
      { type: "complete", data: {} },
    ]);
    const onFinally = vi.fn();
    const onComplete = vi.fn().mockResolvedValue({ cancel: true });

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onFinally });
    await collectEvents(stream);

    expect(onFinally).toHaveBeenCalledOnce();
  });

  it("emits error event to client when upstream body is null", async () => {
    const response = { body: null } as unknown as Response;
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(response, { ...baseOpts, onFinally });
    const events = await collectEvents(stream);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(onFinally).toHaveBeenCalledWith({ success: false });
  });

  describe("onProgress", () => {
    it("allows suppressing events", async () => {
      const upstream = fakeResponse([
        { type: "field_complete", field: "stage", value: "deepdive" },
        { type: "string_chunk", text: "hello" },
        { type: "complete", data: {} },
      ]);
      const onProgress = vi.fn().mockImplementation((ev: Record<string, unknown>) => {
        if (ev.type === "field_complete") return { suppress: true };
      });

      const stream = createSSEProxyStream(upstream, { ...baseOpts, onProgress });
      const events = await collectEvents(stream);

      expect(events.map(e => e.type)).toEqual(["string_chunk", "complete"]);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it("allows emitting extra events", async () => {
      const upstream = fakeResponse([
        { type: "field_complete", field: "stage", value: "interview_ready" },
        { type: "complete", data: {} },
      ]);
      const onProgress = vi.fn().mockImplementation((ev: Record<string, unknown>) => {
        if (ev.type === "field_complete") {
          return {
            suppress: true,
            emitExtra: [{ type: "hint_ready", hint: "draft available" }],
          };
        }
      });

      const stream = createSSEProxyStream(upstream, { ...baseOpts, onProgress });
      const events = await collectEvents(stream);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "hint_ready", hint: "draft available" });
      expect(events[1]).toEqual({ type: "complete", data: {} });
    });

    it("does not intercept complete or error events", async () => {
      const upstream = fakeResponse([
        { type: "complete", data: {} },
      ]);
      const onProgress = vi.fn();

      const stream = createSSEProxyStream(upstream, { ...baseOpts, onProgress });
      await collectEvents(stream);

      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  it("handles chunked delivery across read boundaries", async () => {
    const encoder = new TextEncoder();
    const event1 = `data: ${JSON.stringify({ type: "progress", step: 1 })}\n\n`;
    const event2 = `data: ${JSON.stringify({ type: "complete", data: {} })}\n\n`;
    const combined = event1 + event2;
    const mid = Math.floor(combined.length / 2);
    const chunk1 = combined.slice(0, mid);
    const chunk2 = combined.slice(mid);

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk1));
        controller.enqueue(encoder.encode(chunk2));
        controller.close();
      },
    });
    const response = { body } as unknown as Response;

    const stream = createSSEProxyStream(response, baseOpts);
    const events = await collectEvents(stream);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "progress", step: 1 });
    expect(events[1]).toEqual({ type: "complete", data: {} });
  });

  it("onComplete error emits error event to client and stops", async () => {
    const upstream = fakeResponse([
      { type: "complete", data: {} },
    ]);
    const onComplete = vi.fn().mockRejectedValue(new Error("DB save failed"));
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onFinally });
    const events = await collectEvents(stream);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(onFinally).toHaveBeenCalledOnce();
  });
});
