import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { splitInternalTelemetry } from "@/lib/ai/cost-summary-log";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { createSSEProxyStream } from "@/lib/fastapi/sse-proxy";
import { SSE_RESPONSE_HEADERS } from "@/lib/fastapi/stream-config";
import { fetchUpstreamSSE } from "@/lib/fastapi/stream-transport";
import type {
  InterviewFeedback,
  InterviewMessage,
  InterviewShortCoaching,
} from "@/lib/interview/conversation";
import type { InterviewPlan, InterviewStageStatus, InterviewTurnMeta, InterviewTurnState } from "@/lib/interview/session";
import { computeTotalTokens, incrementDailyTokenCount } from "@/lib/llm-cost-limit";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import type { InterviewFeedbackHistoryItem } from ".";
import {
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
  normalizeInterviewPersistenceError,
} from "./persistence-errors";

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
  prompt_version?: string | null;
  followup_policy_version?: string | null;
  case_seed_version?: string | null;
  short_coaching?: InterviewShortCoaching | null;
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
  shortCoaching?: InterviewShortCoaching | null;
};

export function createImmediateInterviewStream(data: InterviewClientCompleteData) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "complete",
            data: {
              ...data,
              creditCost: data.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
            },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
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
  companyId?: string;
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
  const principalPlan = await getViewerPlan(options.identity ?? { userId: null, guestId: null });
  const { response: upstreamResponse, clearTimeout: clearUpstreamTimeout } =
    await fetchUpstreamSSE({
      path: options.upstreamPath,
      payload: options.upstreamPayload,
      principal: {
        scope: "ai-stream",
        actor: options.identity?.userId
          ? { kind: "user", id: options.identity.userId }
          : { kind: "guest", id: options.identity?.guestId ?? "guest" },
        companyId: options.companyId ?? null,
        plan: principalPlan,
      },
    });

  if (!upstreamResponse.ok) {
    clearUpstreamTimeout();
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

  let errorSeen = false;

  const stream = createSSEProxyStream(upstreamResponse, {
    feature: "interview",
    requestId: options.request.headers.get("x-request-id") ?? "",
    onComplete: async (event) => {
      // Interview complete events nest telemetry inside `data`, not at top level.
      const rawData = (event.data || {}) as Record<string, unknown>;
      const { payload: cleanData, telemetry } = splitInternalTelemetry(rawData);

      try {
        const clientData = await options.onComplete(cleanData as UpstreamCompleteData);
        if (options.identity && telemetry) {
          void incrementDailyTokenCount(options.identity, computeTotalTokens(telemetry));
        }
        return {
          replaceEvent: {
            type: "complete",
            data: {
              ...clientData,
              creditCost: clientData.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
            },
          },
        };
      } catch (error) {
        // Persistence errors produce a specific SSE error event instead of
        // letting sse-proxy emit a generic one.
        const normalized = normalizeInterviewPersistenceError(error, {
          companyId: "unknown",
          operation: "interview:stream:onComplete",
        });
        if (normalized) {
          return {
            replaceEvent: {
              type: "error",
              code: INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
              message:
                "現在、面接対策の保存機能を一時的に利用できません。しばらくしてから再度お試しください。",
            },
          };
        }
        throw error;
      }
    },
    onError: async () => {
      errorSeen = true;
      await options.onError?.();
    },
    onFinally: async ({ success }) => {
      clearUpstreamTimeout();
      if (!success && !errorSeen) {
        await options.onAbort?.();
      }
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
