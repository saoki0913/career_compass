import { describe, expect, it, vi } from "vitest";

import type { SSEProxyOptions } from "./sse-proxy";

const { fetchUpstreamSSEMock, createSSEProxyStreamSpy } = vi.hoisted(() => ({
  fetchUpstreamSSEMock: vi.fn(),
  // Spy that records the options passed to createSSEProxyStream while still
  // delegating to the real implementation (so the proxy stream behaves normally).
  createSSEProxyStreamSpy: vi.fn(),
}));

vi.mock("./stream-transport", () => ({
  fetchUpstreamSSE: fetchUpstreamSSEMock,
}));

vi.mock("./sse-proxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sse-proxy")>();
  createSSEProxyStreamSpy.mockImplementation(actual.createSSEProxyStream);
  return {
    ...actual,
    createSSEProxyStream: createSSEProxyStreamSpy,
  };
});

import {
  createConfiguredSSEProxyResponse,
  createSSEProxyOptionsFromConfig,
  fetchConfiguredUpstreamSSE,
} from "./stream-pipeline";
import { STREAM_FEATURE_CONFIGS } from "./stream-config";

function fakeResponse(events: Record<string, unknown>[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
  );
}

async function drain(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return;
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

describe("stream-pipeline", () => {
  it("builds SSE proxy options from feature config", () => {
    const options = createSSEProxyOptionsFromConfig(STREAM_FEATURE_CONFIGS.gakuchika, {
      requestId: "req-1",
    });

    expect(options.feature).toBe("gakuchika");
    expect(options.requestId).toBe("req-1");
  });

  it("clears upstream timeout before running the caller finally hook", async () => {
    const clearUpstreamTimeout = vi.fn();
    const onFinally = vi.fn();

    const response = createConfiguredSSEProxyResponse({
      config: STREAM_FEATURE_CONFIGS.interview,
      upstreamResponse: fakeResponse([{ type: "complete", data: { ok: true } }]),
      requestId: "req-1",
      clearUpstreamTimeout,
      onFinally,
    });

    await drain(response);

    expect(clearUpstreamTimeout).toHaveBeenCalledOnce();
    expect(onFinally).toHaveBeenCalledWith({ success: true });
    expect(clearUpstreamTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      onFinally.mock.invocationCallOrder[0],
    );
  });

  it("forwards clientSignal to the upstream fetch", async () => {
    fetchUpstreamSSEMock.mockReset();
    fetchUpstreamSSEMock.mockResolvedValue({
      response: new Response("ok"),
      clearTimeout: vi.fn(),
      abortUpstream: vi.fn(),
    });
    const clientSignal = new AbortController().signal;

    await fetchConfiguredUpstreamSSE({
      config: STREAM_FEATURE_CONFIGS.interview,
      payload: { foo: 1 },
      principal: {
        scope: "ai-stream",
        actor: { kind: "guest", id: "guest-1" },
        plan: "guest",
      },
      requestId: "req-9",
      clientSignal,
    });

    expect(fetchUpstreamSSEMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientSignal, requestId: "req-9" }),
    );
  });

  it("forwards abortUpstream to the SSE proxy", () => {
    createSSEProxyStreamSpy.mockClear();
    const abortUpstream = vi.fn();

    createConfiguredSSEProxyResponse({
      config: STREAM_FEATURE_CONFIGS.interview,
      upstreamResponse: fakeResponse([{ type: "complete", data: { ok: true } }]),
      requestId: "req-1",
      abortUpstream,
    });

    expect(createSSEProxyStreamSpy).toHaveBeenCalledOnce();
    const proxyOptions = createSSEProxyStreamSpy.mock.calls[0][1] as SSEProxyOptions;
    expect(proxyOptions.abortUpstream).toBe(abortUpstream);
  });
});
