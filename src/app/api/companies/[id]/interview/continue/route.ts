import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";

import {
  buildInterviewContext,
  saveInterviewConversationProgress,
  validateInterviewTurnState,
} from "../shared";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import { createInterviewUpstreamStream } from "../stream-utils";

function buildSeedSummary(materials: Array<{ kind?: string; label: string; text: string }>) {
  return materials
    .filter((material) => material.kind === "industry_seed" || material.kind === "company_seed")
    .map((material) => `${material.label}: ${material.text}`)
    .join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "面接対策を利用するには認証が必要です。",
      action: "ログイン、またはゲスト状態を確認してから、もう一度お試しください。",
    });
  }

  const { id: companyId } = await params;
  let context;
  try {
    context = await buildInterviewContext(companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:continue",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
  if (!context?.conversation) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "INTERVIEW_CONVERSATION_NOT_FOUND",
      userMessage: "面接対策の会話が見つかりません。",
      action: "面接対策を開始してから、もう一度お試しください。",
    });
  }

  const latestFeedback = context.feedbackHistories[0];
  if (!latestFeedback) {
    return createApiErrorResponse(request, {
      status: 409,
      code: "INTERVIEW_FEEDBACK_REQUIRED",
      userMessage: "続きから深掘りするには、先に最終講評を作成してください。",
      action: "最終講評を作成してから、もう一度お試しください。",
    });
  }

  return createInterviewUpstreamStream({
    request,
    upstreamPath: "/api/interview/continue",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      es_summary: context.esSummary,
      conversation_history: context.conversation.messages,
      turn_state: context.conversation.turnState,
      selected_industry: context.setup.selectedIndustry,
      selected_role: context.setup.selectedRole,
      selected_role_source: context.setup.selectedRoleSource,
      latest_feedback: {
        overall_comment: latestFeedback.overallComment,
        scores: latestFeedback.scores,
        strengths: latestFeedback.strengths,
        improvements: latestFeedback.improvements,
        improved_answer: latestFeedback.improvedAnswer,
        preparation_points: latestFeedback.preparationPoints,
        premise_consistency: latestFeedback.premiseConsistency,
      },
      seed_summary: buildSeedSummary(context.materials),
    },
    onComplete: async (upstreamData) => {
      const transitionLine =
        typeof upstreamData.transition_line === "string" &&
        upstreamData.transition_line.trim().length > 0
          ? upstreamData.transition_line.trim()
          : null;
      const question = typeof upstreamData.question === "string" ? upstreamData.question.trim() : "";
      const assistantMessages = [
        ...(transitionLine ? [{ role: "assistant" as const, content: transitionLine }] : []),
        ...(question ? [{ role: "assistant" as const, content: question }] : []),
      ];
      const messages = [...context.conversation!.messages, ...assistantMessages];
      const turnState =
        validateInterviewTurnState(upstreamData.turn_state ?? null) ??
        context.conversation!.turnState;

      await saveInterviewConversationProgress({
        conversationId: context.conversation!.id,
        companyId,
        messages,
        turnState,
        status: "in_progress",
      });

      return {
        messages,
        questionCount: turnState.totalQuestionCount,
        stageStatus: upstreamData.stage_status ?? context.conversation!.stageStatus,
        questionStage:
          typeof upstreamData.question_stage === "string"
            ? upstreamData.question_stage
            : turnState.currentStage,
        focus:
          typeof upstreamData.focus === "string" && upstreamData.focus.trim().length > 0
            ? upstreamData.focus.trim()
            : turnState.lastQuestionFocus,
        feedback: null,
        questionFlowCompleted: false,
        creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
        turnState,
        transitionLine,
        feedbackHistories: context.feedbackHistories,
      };
    },
  });
}
