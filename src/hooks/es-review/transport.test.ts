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
      original_content: "before",
      rewrites: ["after"],
      overall_comment: "ok",
      improvement_explanation: "理由を補強した",
      template_review: {
        template_type: "self_pr",
        keyword_sources: [
          {
            title: "source",
            url: "https://example.com",
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
              'data: {"type":"string_chunk","path":"streaming_rewrite","text":"after"}',
              'data: {"type":"string_chunk","path":"improvement_explanation","text":"理由を"}',
              'data: {"type":"complete","result":{"original_content":"before","rewrites":["after"],"overall_comment":"ok","improvement_explanation":"理由を補強した","template_review":{"template_type":"self_pr","keyword_sources":[{"title":"source","url":"https://example.com","excerpt":"evidence"}]}},"creditCost":7}',
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

    expect(seen).toEqual(["progress", "string_chunk", "string_chunk", "complete"]);
    expect(consumed).toEqual({
      ok: true,
      result,
      creditCost: 7,
    });
  });

  it("returns stream error payloads", async () => {
    const { consumeESReviewStream } = await import("./transport");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"type":"error","message":"failed"}\n\n'),
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
    });
  });
});
