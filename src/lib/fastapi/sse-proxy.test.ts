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

function fakeTextResponse(text: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(body);
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

  it("does not call onComplete on error events — calls onError with a safe payload instead", async () => {
    const upstream = fakeResponse([
      { type: "error", message: "something failed", error_type: "provider_failure" },
    ]);
    const onComplete = vi.fn();
    const onError = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onError });
    const events = await collectEvents(stream);

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith({
      type: "error",
      message: "AIサービスでエラーが発生しました。",
      code: "TEST_STREAM_FAILED",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error_type: "provider_failure",
    });
    expect(events[0]).toEqual(onError.mock.calls[0][0]);
  });

  it("preserves sanitized FastAPI error metadata without exposing raw technical messages", async () => {
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
      message: "AIサービスでエラーが発生しました。",
      code: "TEST_STREAM_FAILED",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error_type: "tenant_key_not_configured",
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

  it("treats an error-type complete replacement as non-success even without cancel (layer-1 guard)", async () => {
    // A complete-hook that replaces the event with an error but omits cancel
    // must NOT be counted as success — the layer-1 guard fails safe so callers
    // refund. (Regression guard for interview INTERVIEW_PERSISTENCE_UNAVAILABLE.)
    const upstream = fakeResponse([
      { type: "complete", data: { raw: true } },
      { type: "complete", data: { shouldNotBeRead: true } },
    ]);
    const onComplete = vi.fn().mockResolvedValue({
      replaceEvent: { type: "error", code: "PERSISTENCE_UNAVAILABLE", message: "保存に失敗" },
      // intentionally no `cancel: true`
    });
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onFinally });
    const events = await collectEvents(stream);

    expect(onFinally).toHaveBeenCalledOnce();
    expect(onFinally).toHaveBeenCalledWith({ success: false });
    // The error event is forwarded, and the stream stops (the second complete is
    // never processed, so onComplete is called only once).
    expect(onComplete).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "PERSISTENCE_UNAVAILABLE" });
  });

  it("still counts a normal complete replacement as success", async () => {
    const upstream = fakeResponse([{ type: "complete", data: { raw: true } }]);
    const onComplete = vi.fn().mockResolvedValue({
      replaceEvent: { type: "complete", data: { enriched: true } },
    });
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onComplete, onFinally });
    await collectEvents(stream);

    expect(onFinally).toHaveBeenCalledWith({ success: true });
  });

  it("invokes onFinally when the browser cancels the proxied stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "progress", step: 1 })}\n\n`));
      },
    });
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(new Response(body), { ...baseOpts, onFinally });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(onFinally).toHaveBeenCalledOnce();
    expect(onFinally).toHaveBeenCalledWith({ success: false });
  });

  it("aborts upstream when the browser cancels before completion", async () => {
    // A never-ending upstream body simulates an in-flight LLM stream the client
    // disconnects from. cancel() must propagate to the upstream fetch so FastAPI
    // receives GeneratorExit and stops the LLM (Phase 6 cost control).
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "progress", step: 1 })}\n\n`));
      },
    });
    const abortUpstream = vi.fn();

    const stream = createSSEProxyStream(new Response(body), { ...baseOpts, abortUpstream });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(abortUpstream).toHaveBeenCalledOnce();
    expect(abortUpstream).toHaveBeenCalledWith("client_disconnect");
  });

  it("does NOT abort upstream when the stream completed normally", async () => {
    // After a normal complete event the upstream has already finished, so a late
    // browser cancel of the (already-closed) stream must not fire abortUpstream
    // and risk reporting a spurious cancellation to FastAPI.
    const upstream = fakeResponse([{ type: "complete", data: { ok: true } }]);
    const abortUpstream = vi.fn();
    const onComplete = vi.fn().mockResolvedValue(undefined);

    const stream = createSSEProxyStream(upstream, { ...baseOpts, abortUpstream, onComplete });
    const reader = stream.getReader();
    // Drain to completion.
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    // A late cancel after normal completion must be a no-op for abortUpstream.
    await reader.cancel();

    expect(onComplete).toHaveBeenCalledOnce();
    expect(abortUpstream).not.toHaveBeenCalled();
  });

  it("does NOT abort upstream after an onComplete-driven cancel:true success", async () => {
    // cancel:true on a successful complete (e.g. interview/gakuchika) stops the
    // proxy intentionally; this is a normal completion, not a client disconnect,
    // so abortUpstream must not fire.
    const upstream = fakeResponse([
      { type: "complete", data: { ok: true } },
      { type: "complete", data: { shouldNotBeRead: true } },
    ]);
    const abortUpstream = vi.fn();
    const onComplete = vi.fn().mockResolvedValue({ cancel: true });

    const stream = createSSEProxyStream(upstream, { ...baseOpts, abortUpstream, onComplete });
    await collectEvents(stream);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(abortUpstream).not.toHaveBeenCalled();
  });

  it("aborts upstream when the browser cancels even if abortUpstream is the only hook", async () => {
    // Guard: abortUpstream must run independently of onFinally being supplied.
    const body = new ReadableStream<Uint8Array>({
      start() {
        // emit nothing, keep open
      },
    });
    const abortUpstream = vi.fn();

    const stream = createSSEProxyStream(new Response(body), { ...baseOpts, abortUpstream });
    const reader = stream.getReader();
    await reader.cancel();

    expect(abortUpstream).toHaveBeenCalledWith("client_disconnect");
  });

  it("emits error event to client when upstream body is null", async () => {
    const response = { body: null } as unknown as Response;
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(response, { ...baseOpts, onFinally });
    const events = await collectEvents(stream);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0]).toMatchObject({
      code: "TEST_EMPTY_RESPONSE",
      retryable: true,
    });
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

  it("does not forward malformed upstream data blocks raw", async () => {
    const upstream = fakeTextResponse("data: provider stack trace secret token leaked\n\n");
    const onFinally = vi.fn();

    const stream = createSSEProxyStream(upstream, { ...baseOpts, onFinally });
    const events = await collectEvents(stream);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      code: "TEST_MALFORMED_UPSTREAM_EVENT",
      retryable: true,
    });
    expect(JSON.stringify(events)).not.toContain("provider stack trace");
    expect(JSON.stringify(events)).not.toContain("secret token");
    expect(onFinally).toHaveBeenCalledWith({ success: false });
  });

  it("suppresses non-data SSE comments without emitting an error", async () => {
    const upstream = fakeTextResponse(": keep-alive\n\ndata: {\"type\":\"complete\",\"data\":{}}\n\n");

    const stream = createSSEProxyStream(upstream, baseOpts);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ type: "complete", data: {} }]);
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
    expect(events[0]).toMatchObject({
      code: "TEST_COMPLETE_HOOK_FAILED",
      retryable: true,
    });
    expect(onFinally).toHaveBeenCalledOnce();
  });

  it("does not include requestId in browser-forwarded error events", async () => {
    const upstream = fakeResponse([
      { type: "error", message: "何かエラーが発生しました", code: "STREAM_FAIL" },
    ]);
    const stream = createSSEProxyStream(
      upstream,
      { ...baseOpts, feature: "test", requestId: "req-secret-123" },
    );
    const events = await collectEvents(stream);
    for (const event of events) {
      expect(event).not.toHaveProperty("requestId");
      expect(JSON.stringify(event)).not.toContain("req-secret-123");
    }
  });
});
