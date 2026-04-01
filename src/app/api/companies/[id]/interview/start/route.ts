import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { createInitialInterviewTurnState, getInterviewStageStatus } from "@/lib/interview/session";

import {
  buildInterviewContext,
  ensureInterviewConversation,
  saveInterviewConversationProgress,
  validateInterviewTurnState,
} from "../shared";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import {
  createImmediateInterviewStream,
  createInterviewUpstreamStream,
} from "../stream-utils";

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
      operation: "interview:start",
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

  let body: { selectedIndustry?: string | null; selectedRole?: string | null; selectedRoleSource?: string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const selectedIndustry =
    typeof body.selectedIndustry === "string" && body.selectedIndustry.trim().length > 0
      ? body.selectedIndustry.trim()
      : context.setup.selectedIndustry;
  const selectedRole =
    typeof body.selectedRole === "string" && body.selectedRole.trim().length > 0
      ? body.selectedRole.trim()
      : context.setup.selectedRole;
  const selectedRoleSource =
    typeof body.selectedRoleSource === "string" && body.selectedRoleSource.trim().length > 0
      ? body.selectedRoleSource.trim()
      : context.setup.selectedRoleSource;

  if (context.setup.requiresIndustrySelection && !selectedIndustry) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_INDUSTRY_REQUIRED",
      userMessage: "面接対策を始める前に業界を選択してください。",
      action: "業界を選択してから、もう一度お試しください。",
    });
  }

  if (!selectedRole) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_ROLE_REQUIRED",
      userMessage: "面接対策を始める前に職種を選択してください。",
      action: "職種を選択してから、もう一度お試しください。",
    });
  }

  let conversation;
  try {
    conversation = await ensureInterviewConversation(companyId, identity, {
      selectedIndustry,
      selectedRole,
      selectedRoleSource,
    });
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:start",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }

  if (context.conversation && context.conversation.messages.length > 0) {
    return createImmediateInterviewStream({
      messages: context.conversation.messages,
      questionCount: context.conversation.questionCount,
      stageStatus: context.conversation.stageStatus,
      questionStage: context.conversation.questionStage,
      focus: context.conversation.turnState.lastQuestionFocus,
      feedback: context.conversation.feedback,
      questionFlowCompleted: context.conversation.questionFlowCompleted,
      creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
      turnState: context.conversation.turnState,
      feedbackHistories: context.feedbackHistories,
    });
  }

  return createInterviewUpstreamStream({
    request,
    upstreamPath: "/api/interview/start",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      es_summary: context.esSummary,
      selected_industry: selectedIndustry,
      selected_role: selectedRole,
      selected_role_source: selectedRoleSource,
      seed_summary: buildSeedSummary(context.materials),
    },
    onComplete: async (upstreamData) => {
      const question = typeof upstreamData.question === "string" ? upstreamData.question.trim() : "";
      const transitionLine =
        typeof upstreamData.transition_line === "string" &&
        upstreamData.transition_line.trim().length > 0
          ? upstreamData.transition_line.trim()
          : null;
      const messages = [
        ...(transitionLine ? [{ role: "assistant" as const, content: transitionLine }] : []),
        ...(question ? [{ role: "assistant" as const, content: question }] : []),
      ];
      const turnStateToPersist =
        validateInterviewTurnState(upstreamData.turn_state ?? null) ??
        context.conversation?.turnState ??
        createInitialInterviewTurnState();

      await saveInterviewConversationProgress({
        conversationId: conversation.id,
        companyId,
        messages,
        turnState: turnStateToPersist,
        status: "in_progress",
      });

      return {
        messages,
        questionCount: turnStateToPersist.totalQuestionCount,
        stageStatus: upstreamData.stage_status ?? getInterviewStageStatus(turnStateToPersist.currentStage),
        questionStage: turnStateToPersist.currentStage,
        focus:
          typeof upstreamData.focus === "string" && upstreamData.focus.trim().length > 0
            ? upstreamData.focus.trim()
            : turnStateToPersist.lastQuestionFocus,
        feedback: null,
        questionFlowCompleted: false,
        creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
        turnState: turnStateToPersist,
        transitionLine,
        feedbackHistories: context.feedbackHistories,
      };
    },
  });
}
