import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/cost-summary-log", () => ({
  splitInternalTelemetry: vi.fn((payload: Record<string, unknown>) => ({
    payload,
    telemetry: null,
  })),
}));

describe("api/gakuchika/fastapi-stream", () => {
  it("derives next action from a completed SSE payload", async () => {
    const { consumeGakuchikaNextQuestionSse } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"次は結果ですか？","conversation_state":{"stage":"draft_ready","ready_for_draft":true,"progress_label":"ES作成可"},"next_action":"show_generate_draft_cta"}}\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const result = await consumeGakuchikaNextQuestionSse(response);

    expect(result).toEqual({
      ok: true,
      question: "次は結果ですか？",
      conversationState: expect.objectContaining({
        stage: "draft_ready",
        readyForDraft: true,
      }),
      nextAction: "show_generate_draft_cta",
      telemetry: null,
    });
  });
});
