import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredSSEProxyResponse,
  createSSEProxyOptionsFromConfig,
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
});
