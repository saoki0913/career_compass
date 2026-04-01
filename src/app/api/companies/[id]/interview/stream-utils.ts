import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import type { InterviewFeedback, InterviewMessage } from "@/lib/interview/conversation";
import type { InterviewStageStatus, InterviewTurnState } from "@/lib/interview/session";
import type { InterviewFeedbackHistoryItem } from "./shared";

type UpstreamCompleteData = {
  question?: string;
  transition_line?: string | null;
  focus?: string | null;
  question_stage?: string | null;
  stage_status?: InterviewStageStatus | null;
  question_flow_completed?: boolean;
  turn_state?: Partial<InterviewTurnState> | null;
  overall_comment?: string;
  scores?: InterviewFeedback["scores"];
  strengths?: string[];
  improvements?: string[];
  improved_answer?: string;
  preparation_points?: string[];
  premise_consistency?: number;
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
    improved_answer:
      typeof data.improved_answer === "string" ? data.improved_answer : "",
    preparation_points: Array.isArray(data.preparation_points)
      ? data.preparation_points
      : [],
    premise_consistency:
      typeof data.premise_consistency === "number" ? data.premise_consistency : undefined,
  };
}

export async function createInterviewUpstreamStream(options: {
  request: NextRequest;
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
            const upstreamData = (event.data || {}) as UpstreamCompleteData;
            const clientData = await options.onComplete(upstreamData);
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
