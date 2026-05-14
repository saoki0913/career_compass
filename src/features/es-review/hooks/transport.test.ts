import { describe, expect, it, vi } from "vitest";

import type { ReviewResult, SSEEvent } from "./types";

describe("es-review transport", () => {
  it("parses SSE event payloads", async () => {
    const { parseSSEEvent } = await import("./transport");

    expect(parseSSEEvent('data: {"type":"progress","step":"analysis","progress":42}\n\n')).toEqual({
      type: "progress",
      step: "analysis",
      progress: 42,
    });
  });

  it("consumes stream events and emits callbacks in order", async () => {
    const { consumeESReviewStream } = await import("./transport");

    const seen: string[] = [];
    const result: ReviewResult = {
      rewrites: ["after"],
      improvement_explanation: "{\"version\":2,\"improvement_points\":[],\"main_changes\":[]}",
      template_review: {
        template_type: "self_pr",
        variants: [],
        keyword_sources: [
          {
            title: "source",
            source_url: "https://example.com",
            content_type: "corporate_site",
            excerpt: "evidence",
          },
        ],
      },
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            [
              'data: {"type":"progress","step":"analysis","progress":42}',
              'data: {"type":"rewrite_delta","text":"after","path":"streaming_rewrite"}',
              'data: {"type":"explanation_complete","value":"{\\"version\\":2,\\"improvement_points\\":[],\\"main_changes\\":[]}","path":"improvement_explanation"}',
              'data: {"type":"complete","requestId":"req-1","result":{"rewrites":["after"],"improvement_explanation":"{\\"version\\":2,\\"improvement_points\\":[],\\"main_changes\\":[]}","template_review":{"template_type":"self_pr","variants":[],"keyword_sources":[{"title":"source","source_id":"source-1","source_url":"https://example.com","content_type":"corporate_site","excerpt":"evidence"}]}},"creditCost":7}',
              "",
            ].join("\n\n"),
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const consumed = await consumeESReviewStream({
      response,
      onEvent(event) {
        seen.push((event as SSEEvent).type);
      },
    });

    expect(seen).toEqual(["progress", "rewrite_delta", "explanation_complete", "complete"]);
    expect(consumed).toEqual({
      ok: true,
      result,
      creditCost: 7,
    });
  });

  it("drops non-public fields from parsed complete payloads", async () => {
    const { parseSSEEvent } = await import("./transport");

    const event = parseSSEEvent(
      'data: {"type":"complete","requestId":"req-1","result":{"rewrites":["after"],"template_review":{"template_type":"self_pr","variants":[],"keyword_sources":[{"source_id":"src-1","source_url":"https://example.com","content_type":"corporate_site","title":"source"}]},"review_meta":{"grounding_mode":"none","rewrite_attempt_count":3,"repair_dispatches":["x"],"fallback_reason":"debug"}}}\n\n',
    );

    expect(JSON.stringify(event)).not.toContain("source_id");
    expect(JSON.stringify(event)).not.toContain("requestId");
    expect(JSON.stringify(event)).not.toContain("rewrite_attempt_count");
    expect(JSON.stringify(event)).not.toContain("repair_dispatches");
    expect(JSON.stringify(event)).not.toContain("fallback_reason");
  });

  it("returns stream error payloads with diagnostics", async () => {
    const { consumeESReviewStream } = await import("./transport");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"error","message":"failed","code":"ES_REVIEW_STREAM_FAILED","requestId":"req-1","action":"retry later","retryable":true,"llmErrorType":"provider_failure"}\n\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const consumed = await consumeESReviewStream({
      response,
      onEvent: vi.fn(),
    });

    expect(consumed).toEqual({
      ok: false,
      reason: "stream_error",
      message: "failed",
      code: "ES_REVIEW_STREAM_FAILED",
      action: "retry later",
      retryable: true,
    });
  });

  it("normalizes JSON-shaped stream error messages before surfacing them", async () => {
    const { consumeESReviewStream } = await import("./transport");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"error","message":"{\\"code\\":\\"TOKEN_LIMIT_SERVICE_UNAVAILABLE\\",\\"userMessage\\":\\"現在、AI機能を一時的に利用できません。\\",\\"action\\":\\"数分後にもう一度お試しください。\\",\\"retryable\\":true}"}\n\n',
          ),
        );
        controller.close();
      },
    });

    const consumed = await consumeESReviewStream({
      response: new Response(stream, { status: 200 }),
      onEvent: vi.fn(),
    });

    expect(consumed).toEqual({
      ok: false,
      reason: "stream_error",
      message: "現在、AI機能を一時的に利用できません。",
      code: "TOKEN_LIMIT_SERVICE_UNAVAILABLE",
      action: "数分後にもう一度お試しください。",
      retryable: true,
    });
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) {
      expect(consumed.message).not.toContain("{");
    }
  });
});
