import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fetchConfiguredUpstreamSSEMock,
  createConfiguredSSEProxyResponseMock,
  getViewerPlanMock,
  logErrorMock,
} = vi.hoisted(() => ({
  fetchConfiguredUpstreamSSEMock: vi.fn(),
  createConfiguredSSEProxyResponseMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/fastapi/stream-pipeline", () => ({
  fetchConfiguredUpstreamSSE: fetchConfiguredUpstreamSSEMock,
  createConfiguredSSEProxyResponse: createConfiguredSSEProxyResponseMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: getViewerPlanMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

import { createInterviewUpstreamStream, normalizeFeedback } from "./stream-utils";

describe("interview stream utils", () => {
  beforeEach(() => {
    fetchConfiguredUpstreamSSEMock.mockReset();
    createConfiguredSSEProxyResponseMock.mockReset();
    getViewerPlanMock.mockReset();
    logErrorMock.mockReset();
    getViewerPlanMock.mockResolvedValue("free");
  });

  it("normalizes v2.1 feedback linkage fields from upstream payload", () => {
    expect(
      normalizeFeedback({
        overall_comment: "総評",
        scores: { logic: 4 },
        strengths: ["構造化"],
        improvements: ["比較軸"],
        consistency_risks: ["将来像が浅い"],
        weakest_question_type: "motivation",
        weakest_turn_id: "turn-3",
        weakest_question_snapshot: "なぜ当社なのですか。",
        weakest_answer_snapshot: "事業に魅力を感じたからです。",
        improved_answer: "改善回答",
        next_preparation: ["比較軸の整理"],
        premise_consistency: 77,
        satisfaction_score: 4,
        score_evidence_by_axis: { logic: ["順序立てて説明"] },
        score_rationale_by_axis: { logic: "回答の流れは明確です。" },
        confidence_by_axis: { logic: "medium" },
      }),
    ).toEqual({
      overall_comment: "総評",
      scores: { logic: 4 },
      strengths: ["構造化"],
      improvements: ["比較軸"],
      consistency_risks: ["将来像が浅い"],
      weakest_question_type: "motivation",
      weakest_turn_id: "turn-3",
      weakest_question_snapshot: "なぜ当社なのですか。",
      weakest_answer_snapshot: "事業に魅力を感じたからです。",
      improved_answer: "改善回答",
      next_preparation: ["比較軸の整理"],
      premise_consistency: 77,
      satisfaction_score: 4,
      score_evidence_by_axis: { logic: ["順序立てて説明"] },
      score_rationale_by_axis: { logic: "回答の流れは明確です。" },
      confidence_by_axis: { logic: "medium" },
    });
  });

  it("runs onError cleanup when upstream fetch throws", async () => {
    const fetchError = new Error("upstream unavailable");
    const onError = vi.fn(async () => undefined);
    fetchConfiguredUpstreamSSEMock.mockRejectedValue(fetchError);

    await expect(
      createInterviewUpstreamStream({
        request: new NextRequest("http://localhost/api/interview"),
        identity: { userId: "user-1", guestId: null },
        companyId: "company-1",
        upstreamPath: "/api/interview/turn",
        upstreamPayload: {},
        onComplete: async () => ({
          messages: [],
          questionCount: 0,
          stageStatus: null,
          questionStage: null,
          focus: null,
          feedback: null,
          questionFlowCompleted: false,
          creditCost: 1,
          turnState: {
            turnCount: 0,
            currentTopic: null,
            coverageState: [],
            coveredTopics: [],
            remainingTopics: [],
            recentQuestionSummariesV2: [],
            formatPhase: "opening",
            lastQuestion: null,
            lastAnswer: null,
            lastTopic: null,
            currentTurnMeta: null,
            nextAction: "ask",
          },
        }),
        onError,
      }),
    ).rejects.toThrow("upstream unavailable");

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps upstream detail out of the public error response", async () => {
    const clearTimeout = vi.fn();
    const onError = vi.fn(async () => undefined);
    fetchConfiguredUpstreamSSEMock.mockResolvedValue({
      response: Response.json(
        {
          detail:
            "provider timeout while calling confidential-model-route with internal request metadata",
        },
        { status: 503 },
      ),
      clearTimeout,
    });

    const response = await createInterviewUpstreamStream({
      request: new NextRequest("http://localhost/api/interview", {
        headers: { "x-request-id": "request-1" },
      }),
      identity: { userId: "user-1", guestId: null },
      companyId: "company-1",
      upstreamPath: "/api/interview/turn",
      upstreamPayload: {},
      onComplete: async () => {
        throw new Error("not reached");
      },
      onError,
    });

    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error).toMatchObject({
      code: "INTERVIEW_UPSTREAM_FAILED",
      userMessage: "面接対策の応答生成に失敗しました。",
      action: "時間をおいて、もう一度お試しください。",
    });
    expect(JSON.stringify(payload)).not.toContain("confidential-model-route");
    expect(clearTimeout).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(logErrorMock).toHaveBeenCalledWith(
      "interview-upstream-failed",
      expect.any(Error),
      expect.objectContaining({
        requestId: "request-1",
        upstreamDetail: expect.stringContaining("confidential-model-route"),
      }),
    );
  });

  it("forwards the request signal to the upstream and abortUpstream to the proxy", async () => {
    const abortUpstream = vi.fn();
    fetchConfiguredUpstreamSSEMock.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      clearTimeout: vi.fn(),
      abortUpstream,
    });
    createConfiguredSSEProxyResponseMock.mockReturnValue(new Response("stream", { status: 200 }));

    const request = new NextRequest("http://localhost/api/interview");
    await createInterviewUpstreamStream({
      request,
      identity: { userId: "user-1", guestId: null },
      companyId: "company-1",
      upstreamPath: "/api/interview/turn",
      upstreamPayload: {},
      onComplete: async () => {
        throw new Error("not reached");
      },
    });

    expect(fetchConfiguredUpstreamSSEMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientSignal: request.signal }),
    );
    expect(createConfiguredSSEProxyResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortUpstream }),
    );
  });

  it("replaces complete with a cancel:true persistence error so the proxy refunds", async () => {
    const clearTimeout = vi.fn();
    fetchConfiguredUpstreamSSEMock.mockResolvedValue({
      response: new Response("ok", { status: 200 }),
      clearTimeout,
    });
    // Capture the SSE proxy options so we can drive the onComplete hook directly.
    let capturedOptions: { onComplete: (event: Record<string, unknown>) => Promise<unknown> } | undefined;
    createConfiguredSSEProxyResponseMock.mockImplementation((options: typeof capturedOptions) => {
      capturedOptions = options;
      return new Response("stream", { status: 200 });
    });

    await createInterviewUpstreamStream({
      request: new NextRequest("http://localhost/api/interview"),
      identity: { userId: "user-1", guestId: null },
      companyId: "company-1",
      upstreamPath: "/api/interview/start",
      upstreamPayload: {},
      onComplete: async () => {
        // Simulate a persistence failure that normalizes to the unavailable code.
        const err = new Error('relation "interview_conversations" does not exist');
        throw err;
      },
    });

    expect(capturedOptions).toBeDefined();
    const result = (await capturedOptions!.onComplete({ type: "complete", data: {} })) as {
      cancel?: boolean;
      replaceEvent?: { type?: string };
    };
    // The error replacement must carry cancel:true (layer-2 defense) so onFinally
    // runs with success=false and the route refunds the reservation.
    expect(result.cancel).toBe(true);
    expect(result.replaceEvent?.type).toBe("error");
  });
});
