import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fetchConfiguredUpstreamSSEMock,
  createConfiguredSSEProxyResponseMock,
  getViewerPlanMock,
} = vi.hoisted(() => ({
  fetchConfiguredUpstreamSSEMock: vi.fn(),
  createConfiguredSSEProxyResponseMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
}));

vi.mock("@/lib/fastapi/stream-pipeline", () => ({
  fetchConfiguredUpstreamSSE: fetchConfiguredUpstreamSSEMock,
  createConfiguredSSEProxyResponse: createConfiguredSSEProxyResponseMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: getViewerPlanMock,
}));

import { createInterviewUpstreamStream, normalizeFeedback } from "./stream-utils";

describe("interview stream utils", () => {
  beforeEach(() => {
    fetchConfiguredUpstreamSSEMock.mockReset();
    createConfiguredSSEProxyResponseMock.mockReset();
    getViewerPlanMock.mockReset();
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
});
