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
      operation: "interview:stream",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
  if (!context) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "INTERVIEW_COMPANY_NOT_FOUND",
      userMessage: "企業が見つかりません。",
      action: "企業一覧から対象の企業を開き直してください。",
    });
  }

  if (!context.conversation) {
    return createApiErrorResponse(request, {
      status: 409,
      code: "INTERVIEW_NOT_STARTED",
      userMessage: "面接対策がまだ開始されていません。",
      action: "まず面接対策を開始してください。",
    });
  }

  let body: { answer?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const answer =
    typeof body.answer === "string" && body.answer.trim().length > 0
      ? body.answer.trim()
      : "";
  if (!answer) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_ANSWER_REQUIRED",
      userMessage: "回答内容が空です。",
      action: "回答を入力してから送信してください。",
    });
  }

  const nextMessages = [...context.conversation.messages, { role: "user" as const, content: answer }];

  return createInterviewUpstreamStream({
    request,
    upstreamPath: "/api/interview/turn",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      es_summary: context.esSummary,
      conversation_history: nextMessages,
      turn_state: context.conversation.turnState,
      selected_industry: context.setup.selectedIndustry,
      selected_role: context.setup.selectedRole,
      selected_role_source: context.setup.selectedRoleSource,
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
      const messages = [...nextMessages, ...assistantMessages];
      const turnState =
        validateInterviewTurnState(upstreamData.turn_state ?? null) ??
        context.conversation!.turnState;
      const questionFlowCompleted =
        Boolean(upstreamData.question_flow_completed) ||
        turnState.nextAction === "feedback" ||
        turnState.currentStage === "feedback";
      const status = questionFlowCompleted ? "question_flow_completed" : "in_progress";

      await saveInterviewConversationProgress({
        conversationId: context.conversation!.id,
        companyId,
        messages,
        turnState,
        status,
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
        questionFlowCompleted,
        creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
        turnState,
        transitionLine,
        feedbackHistories: context.feedbackHistories,
      };
    },
  });
}
