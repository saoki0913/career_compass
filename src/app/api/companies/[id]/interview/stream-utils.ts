import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import type { InterviewFeedback, InterviewMessage } from "@/lib/interview/conversation";
import type { InterviewPlan, InterviewStageStatus, InterviewTurnMeta, InterviewTurnState } from "@/lib/interview/session";
import type { InterviewFeedbackHistoryItem } from ".";
import { splitInternalTelemetry } from "@/lib/ai/cost-summary-log";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";

type UpstreamCompleteData = {
  question?: string;
  transition_line?: string | null;
  focus?: string | null;
  question_stage?: string | null;
  stage_status?: InterviewStageStatus | null;
  question_flow_completed?: boolean;
  turn_state?: Partial<InterviewTurnState> | null;
  turn_meta?: Partial<InterviewTurnMeta> | null;
  interview_plan?: InterviewPlan | null;
  overall_comment?: string;
  scores?: InterviewFeedback["scores"];
  strengths?: string[];
  improvements?: string[];
  consistency_risks?: string[];
  weakest_question_type?: string | null;
  weakest_turn_id?: string | null;
  weakest_question_snapshot?: string | null;
  weakest_answer_snapshot?: string | null;
  improved_answer?: string;
  preparation_points?: string[];
  next_preparation?: string[];
  premise_consistency?: number;
  satisfaction_score?: number;
};

export type InterviewClientCompleteData = {
  messages: InterviewMessage[];
  questionCount: number;
  stageStatus: InterviewStageStatus | null;
  questionStage: string | null;
  focus: string | null;
  feedback: InterviewFeedback | null;
  questionFlowCompleted: boolean;
  creditCost: number;
  turnState: InterviewTurnState | null;
  turnMeta?: InterviewTurnMeta | null;
  plan?: InterviewPlan | null;
  transitionLine?: string | null;
  feedbackHistories?: InterviewFeedbackHistoryItem[];
};

function formatSseEvent(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function createImmediateInterviewStream(data: InterviewClientCompleteData) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          formatSseEvent({
            type: "complete",
            data: {
              ...data,
              creditCost: data.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
            },
          }),
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function normalizeFeedback(data: UpstreamCompleteData): InterviewFeedback {
  return {
    overall_comment: typeof data.overall_comment === "string" ? data.overall_comment : "",
    scores: data.scores || {},
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    improvements: Array.isArray(data.improvements) ? data.improvements : [],
    consistency_risks: Array.isArray(data.consistency_risks) ? data.consistency_risks : [],
    weakest_question_type:
      typeof data.weakest_question_type === "string" ? data.weakest_question_type : null,
    weakest_turn_id:
      typeof data.weakest_turn_id === "string" ? data.weakest_turn_id : null,
    weakest_question_snapshot:
      typeof data.weakest_question_snapshot === "string" ? data.weakest_question_snapshot : null,
    weakest_answer_snapshot:
      typeof data.weakest_answer_snapshot === "string" ? data.weakest_answer_snapshot : null,
    improved_answer:
      typeof data.improved_answer === "string" ? data.improved_answer : "",
    next_preparation: Array.isArray(data.next_preparation)
      ? data.next_preparation
      : Array.isArray(data.preparation_points)
        ? data.preparation_points
      : [],
    premise_consistency:
      typeof data.premise_consistency === "number" ? data.premise_consistency : undefined,
    satisfaction_score:
      typeof data.satisfaction_score === "number" ? data.satisfaction_score : undefined,
  };
}

export async function createInterviewUpstreamStream(options: {
  request: NextRequest;
  identity?: RequestIdentity;
  upstreamPath:
    | "/api/interview/start"
    | "/api/interview/turn"
    | "/api/interview/feedback"
    | "/api/interview/continue";
  upstreamPayload: Record<string, unknown>;
  onComplete: (data: UpstreamCompleteData) => Promise<InterviewClientCompleteData>;
  onAbort?: () => Promise<void>;
  onError?: () => Promise<void>;
}) {
  // TODO(D-10 Phase 6): wire X-Career-Principal (scope="ai-stream") for interview
  // SSE once the interview generator is aligned with motivation/gakuchika.
  // Interview has multiple upstream paths (start/turn/feedback/continue) and the
  // callers in interview/{start,continue,feedback}/route.ts do not currently
  // thread the acting principal (userId/guestId + plan + companyId) into this
  // helper. Add a `principal` option here and migrate to
  // fetchFastApiWithPrincipal in a follow-up task.
  const upstreamResponse = await fetchFastApiInternal(options.upstreamPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options.upstreamPayload),
  });

  if (!upstreamResponse.ok) {
    await options.onError?.();
    const data = await upstreamResponse.json().catch(() => null);
    return createApiErrorResponse(options.request, {
      status: upstreamResponse.status,
      code: "INTERVIEW_UPSTREAM_FAILED",
      userMessage:
        typeof data?.detail === "string"
          ? data.detail
          : "面接対策の応答生成に失敗しました。",
      action: "時間をおいて、もう一度お試しください。",
    });
  }

  const reader = upstreamResponse.body?.getReader();
  if (!reader) {
    await options.onError?.();
    return createApiErrorResponse(options.request, {
      status: 502,
      code: "INTERVIEW_STREAM_UNAVAILABLE",
      userMessage: "面接対策のストリームを開始できませんでした。",
      action: "少し待ってから、もう一度お試しください。",
    });
  }

  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = "";
      let completed = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(jsonStr) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (
              event.type === "progress" ||
              event.type === "string_chunk" ||
              event.type === "field_complete" ||
              event.type === "array_item_complete"
            ) {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              continue;
            }

            if (event.type === "error") {
              await options.onError?.();
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              return;
            }

            if (event.type !== "complete") {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              continue;
            }

            completed = true;
            const rawCompleteData = (event.data || {}) as Record<string, unknown>;
            const { payload: cleanData, telemetry } = splitInternalTelemetry(rawCompleteData);
            const upstreamData = cleanData as UpstreamCompleteData;
            const clientData = await options.onComplete(upstreamData);
            if (options.identity && telemetry) {
              void incrementDailyTokenCount(options.identity, computeTotalTokens(telemetry));
            }
            controller.enqueue(
              encoder.encode(
                formatSseEvent({
                  type: "complete",
                  data: {
                    ...clientData,
                    creditCost: clientData.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
                  },
                }),
              ),
            );
          }
        }

        if (!completed) {
          await options.onAbort?.();
          controller.enqueue(
            encoder.encode(
              formatSseEvent({
                type: "error",
                message: "ストリームが途中で切断されました。",
              }),
            ),
          );
        }
      } catch {
        await options.onError?.();
        controller.enqueue(
          encoder.encode(
            formatSseEvent({
              type: "error",
              message: "ストリーミング処理中にエラーが発生しました。",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
