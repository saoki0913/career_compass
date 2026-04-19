import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/cost-summary-log", () => ({
  splitInternalTelemetry: vi.fn((payload: Record<string, unknown>) => ({
    payload,
    telemetry: null,
  })),
}));

const { fetchFastApiWithPrincipalMock, getViewerPlanMock } = vi.hoisted(() => ({
  fetchFastApiWithPrincipalMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: getViewerPlanMock,
}));

describe("api/gakuchika/fastapi-stream", () => {
  beforeEach(() => {
    fetchFastApiWithPrincipalMock.mockReset();
    getViewerPlanMock.mockReset();
    getViewerPlanMock.mockResolvedValue("free");
  });

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

  it("ingests coach_progress_message from both partial and complete events", async () => {
    const { consumeGakuchikaNextQuestionSse } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        // Partial patch first (simulates field_complete wire event)
        controller.enqueue(
          encoder.encode(
            'data: {"type":"field_complete","path":"coach_progress_message","value":"あと1-2問で材料が揃いそうです。"}\n',
          ),
        );
        // Complete event replaces the state snapshot
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"次の質問です","conversation_state":{"stage":"es_building","coach_progress_message":"あと1-2問で材料が揃いそうです。"},"next_action":"ask"}}\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const result = await consumeGakuchikaNextQuestionSse(response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversationState.coachProgressMessage).toBe(
      "あと1-2問で材料が揃いそうです。",
    );
  });

  it("silently ignores non-string coach_progress_message partial values", async () => {
    const { consumeGakuchikaNextQuestionSse } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"field_complete","path":"coach_progress_message","value":null}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"Q","conversation_state":{"stage":"es_building"},"next_action":"ask"}}\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const result = await consumeGakuchikaNextQuestionSse(response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Complete event carried no coach_progress_message, so state should be null.
    expect(result.conversationState.coachProgressMessage).toBeNull();
  });

  it("ingests remaining_questions_estimate from complete event as integer", async () => {
    const { consumeGakuchikaNextQuestionSse } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"field_complete","path":"remaining_questions_estimate","value":3}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"Q","conversation_state":{"stage":"es_building","remaining_questions_estimate":3},"next_action":"ask"}}\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const result = await consumeGakuchikaNextQuestionSse(response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversationState.remainingQuestionsEstimate).toBe(3);
  });

  it("silently ignores negative or non-numeric remaining_questions_estimate partials", async () => {
    const { consumeGakuchikaNextQuestionSse } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        // Negative value: must be ignored in partial.
        controller.enqueue(
          encoder.encode(
            'data: {"type":"field_complete","path":"remaining_questions_estimate","value":-2}\n',
          ),
        );
        // String value: must be ignored in partial.
        controller.enqueue(
          encoder.encode(
            'data: {"type":"field_complete","path":"remaining_questions_estimate","value":"three"}\n',
          ),
        );
        // Complete without the field → expect null.
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"Q","conversation_state":{"stage":"es_building"},"next_action":"ask"}}\n',
          ),
        );
        controller.close();
      },
    });

    const response = new Response(stream, { status: 200 });
    const result = await consumeGakuchikaNextQuestionSse(response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversationState.remainingQuestionsEstimate).toBeNull();
  });

  it("calls FastAPI stream with ai-stream principal for restart flows", async () => {
    const { getQuestionFromFastAPI } = await import("./fastapi-stream");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"深掘りを続けます。","conversation_state":{"stage":"deep_dive_active"},"next_action":"ask"}}\n',
          ),
        );
        controller.close();
      },
    });
    fetchFastApiWithPrincipalMock.mockResolvedValue(new Response(stream, { status: 200 }));

    const identity = { userId: "user-1", guestId: null };
    const result = await getQuestionFromFastAPI(
      {
        title: "学園祭運営",
        content: "来場者導線を改善した",
        charLimitType: "400",
      },
      [],
      0,
      null,
      "req-1",
      identity,
    );

    expect(result.error).toBeNull();
    expect(result.question).toBe("深掘りを続けます。");
    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledWith(
      "/api/gakuchika/next-question/stream",
      expect.objectContaining({
        principal: {
          scope: "ai-stream",
          actor: { kind: "user", id: "user-1" },
          companyId: null,
          plan: "free",
        },
      }),
    );
  });
});
