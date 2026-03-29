import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST, consumeCredits, hasEnoughCredits } from "@/lib/credits";
import {
  DEFAULT_INTERVIEW_QUESTION_COUNT,
  getInterviewQuestionStage,
  getInterviewStageStatus,
  shouldChargeInterviewSession,
} from "@/lib/interview/session";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

import type { InterviewFeedback, InterviewMessage } from "./shared";

type InterviewContext = NonNullable<Awaited<ReturnType<typeof import("./shared").buildInterviewContext>>>;

type UpstreamCompleteData = {
  question?: string;
  focus?: string | null;
  question_stage?: string | null;
  stage_status?: unknown;
  overall_comment?: string;
  scores?: InterviewFeedback["scores"];
  strengths?: string[];
  improvements?: string[];
  improved_answer?: string;
  preparation_points?: string[];
};

function formatSseEvent(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function createInterviewMessage(role: "assistant" | "user", content: string): InterviewMessage {
  return { role, content };
}

export function createInterviewQuestionFlowCompleteStream(options: {
  messages: InterviewMessage[];
}) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          formatSseEvent({
            type: "complete",
            data: {
              messages: options.messages,
              questionCount: DEFAULT_INTERVIEW_QUESTION_COUNT,
              stageStatus: getInterviewStageStatus(DEFAULT_INTERVIEW_QUESTION_COUNT, true),
              questionStage: "feedback",
              focus: null,
              feedback: null,
              isCompleted: false,
              questionFlowCompleted: true,
              creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
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

function resolveQuestionCount(messages: InterviewMessage[], isCompleted: boolean) {
  if (isCompleted) {
    return DEFAULT_INTERVIEW_QUESTION_COUNT;
  }
  return messages.filter((message) => message.role === "assistant").length;
}

function normalizeFeedback(data: UpstreamCompleteData): InterviewFeedback {
  return {
    overall_comment: typeof data.overall_comment === "string" ? data.overall_comment : "",
    scores: data.scores || {},
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    improvements: Array.isArray(data.improvements) ? data.improvements : [],
    improved_answer: typeof data.improved_answer === "string" ? data.improved_answer : "",
    preparation_points: Array.isArray(data.preparation_points) ? data.preparation_points : [],
  };
}

export async function createInterviewProxyStream(options: {
  request: NextRequest;
  context: InterviewContext;
  initialMessages: InterviewMessage[];
  upstreamPath: "/api/interview/start" | "/api/interview/turn" | "/api/interview/feedback";
  upstreamPayload: Record<string, unknown>;
  userId: string;
  companyId: string;
  isCompleted: boolean;
}) {
  if (shouldChargeInterviewSession(options.isCompleted)) {
    const canPay = await hasEnoughCredits(options.userId, DEFAULT_INTERVIEW_SESSION_CREDIT_COST);
    if (!canPay) {
      return createApiErrorResponse(options.request, {
        status: 402,
        code: "INTERVIEW_CREDITS_REQUIRED",
        userMessage: "クレジットが不足しています。",
        action: "クレジット残高を確認してから、もう一度お試しください。",
      });
    }
  }

  const upstreamResponse = await fetchFastApiInternal(options.upstreamPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options.upstreamPayload),
  });

  if (!upstreamResponse.ok) {
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

            if (event.type === "progress" || event.type === "string_chunk") {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              continue;
            }

            if (event.type === "error") {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              return;
            }

            if (event.type !== "complete") {
              controller.enqueue(encoder.encode(formatSseEvent(event)));
              continue;
            }

            completed = true;
            const upstreamData = (event.data || {}) as UpstreamCompleteData;
            const nextMessages = [...options.initialMessages];

            if (options.isCompleted) {
              const overallComment =
                typeof upstreamData.overall_comment === "string"
                  ? upstreamData.overall_comment.trim()
                  : "";
              if (overallComment) {
                nextMessages.push(createInterviewMessage("assistant", overallComment));
              }

              const consumption = await consumeCredits(
                options.userId,
                DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
                "interview",
                options.companyId,
                `面接対策: ${options.context.company.name}`,
              );
              if (!consumption.success) {
                controller.enqueue(
                  encoder.encode(
                    formatSseEvent({
                      type: "error",
                      message: "クレジットが不足しています。",
                    }),
                  ),
                );
                return;
              }

              const enrichedEvent = {
                type: "complete",
                data: {
                  messages: nextMessages,
                  questionCount: DEFAULT_INTERVIEW_QUESTION_COUNT,
                  stageStatus: getInterviewStageStatus(DEFAULT_INTERVIEW_QUESTION_COUNT, true),
                  questionStage: "feedback",
                  focus: null,
                  feedback: normalizeFeedback(upstreamData),
                  isCompleted: true,
                  creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
                },
              };
              controller.enqueue(encoder.encode(formatSseEvent(enrichedEvent)));
              continue;
            }

            const question =
              typeof upstreamData.question === "string" ? upstreamData.question.trim() : "";
            if (question) {
              nextMessages.push(createInterviewMessage("assistant", question));
            }

            const questionCount = resolveQuestionCount(nextMessages, false);
            const stage =
              typeof upstreamData.question_stage === "string" && upstreamData.question_stage.length > 0
                ? upstreamData.question_stage
                : getInterviewQuestionStage(questionCount);
            const enrichedEvent = {
              type: "complete",
              data: {
                messages: nextMessages,
                questionCount,
                stageStatus: upstreamData.stage_status || getInterviewStageStatus(questionCount, false),
                questionStage: stage,
                focus:
                  typeof upstreamData.focus === "string" && upstreamData.focus.trim().length > 0
                    ? upstreamData.focus.trim()
                    : null,
                feedback: null,
                isCompleted: false,
                creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
              },
            };
            controller.enqueue(encoder.encode(formatSseEvent(enrichedEvent)));
          }
        }

        if (!completed) {
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
    },
  });
}
