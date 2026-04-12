import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  cancelReservation,
  confirmReservation,
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
  reserveCredits,
} from "@/lib/credits";
import {
  normalizeInterviewTurnMeta,
  type InterviewPlan,
  type InterviewTurnMeta,
} from "@/lib/interview/session";

import {
  buildInterviewContext,
  listInterviewTurnEvents,
  normalizeInterviewPlanValue,
  saveInterviewConversationProgress,
  saveInterviewFeedbackHistory,
  validateInterviewTurnState,
} from "..";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import {
  createInterviewUpstreamStream,
  normalizeFeedback,
} from "../stream-utils";

function buildSeedSummary(materials: Array<{ kind?: string; label: string; text: string }>) {
  return materials
    .filter((material) => material.kind === "industry_seed" || material.kind === "company_seed")
    .map((material) => `${material.label}: ${material.text}`)
    .join("\n");
}

function inferWeakestTurnLinkage(
  feedback: ReturnType<typeof normalizeFeedback>,
  turnEvents: Awaited<ReturnType<typeof listInterviewTurnEvents>>,
) {
  const fallbackTurn =
    turnEvents.find((event) => event.answer.trim().length > 0 && event.deterministicCoveragePassed === false) ??
    turnEvents.find((event) => event.answer.trim().length > 0) ??
    null;

  return {
    ...feedback,
    weakest_turn_id: feedback.weakest_turn_id ?? fallbackTurn?.turnId ?? null,
    weakest_question_snapshot: feedback.weakest_question_snapshot ?? fallbackTurn?.question ?? null,
    weakest_answer_snapshot: feedback.weakest_answer_snapshot ?? fallbackTurn?.answer ?? null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity?.userId) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "ログインが必要です。",
      action: "ログインしてから、もう一度お試しください。",
    });
  }

  const { id: companyId } = await params;
  let context;
  try {
    context = await buildInterviewContext(companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:feedback",
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

  const userAnswerCount = context.conversation.messages.filter((message) => message.role === "user").length;
  if (userAnswerCount === 0) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_NOT_ENOUGH_MESSAGES",
      userMessage: "最終講評を作るには、先に面接質問へ回答してください。",
      action: "少なくとも数問回答してから、もう一度お試しください。",
    });
  }

  const turnEvents = await listInterviewTurnEvents({
    conversationId: context.conversation.id,
    companyId,
    identity,
    limit: 24,
  });

  const reservation = await reserveCredits(
    identity.userId,
    DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
    "interview_feedback",
    companyId,
    `面接対策講評: ${context.company.name}`,
  );
  if (!reservation.success) {
    return createApiErrorResponse(request, {
      status: 402,
      code: "INTERVIEW_CREDITS_REQUIRED",
      userMessage: "クレジットが不足しています。",
      action: "残高を確認してから、もう一度お試しください。",
    });
  }
  const reservationId = reservation.reservationId;

  return createInterviewUpstreamStream({
    request,
    upstreamPath: "/api/interview/feedback",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      academic_summary: context.academicSummary,
      research_summary: context.researchSummary,
      es_summary: context.esSummary,
      conversation_history: context.conversation.messages,
      turn_state: context.conversation.turnState,
      selected_industry: context.setup.selectedIndustry,
      selected_role: context.setup.selectedRole,
      selected_role_source: context.setup.selectedRoleSource,
      role_track: context.setup.roleTrack,
      interview_format: context.setup.interviewFormat,
      selection_type: context.setup.selectionType,
      interview_stage: context.setup.interviewStage,
      interviewer_type: context.setup.interviewerType,
      strictness_mode: context.setup.strictnessMode,
      interview_plan: context.conversation.plan,
      turn_events: turnEvents,
      seed_summary: buildSeedSummary(context.materials),
    },
    onComplete: async (upstreamData) => {
      const feedback = inferWeakestTurnLinkage(normalizeFeedback(upstreamData), turnEvents);
      const turnState =
        validateInterviewTurnState(
          upstreamData.turn_state ?? {
            ...context.conversation!.turnState,
            nextAction: "feedback" as const,
          },
        ) ??
        {
          ...context.conversation!.turnState,
          nextAction: "feedback" as const,
        };
      const turnMeta: InterviewTurnMeta | null =
        normalizeInterviewTurnMeta(upstreamData.turn_meta ?? context.conversation!.turnMeta ?? null);
      const plan: InterviewPlan | null =
        normalizeInterviewPlanValue(upstreamData.interview_plan ?? null) ?? context.conversation!.plan ?? null;
      let feedbackHistories;

      try {
        await saveInterviewConversationProgress({
          conversationId: context.conversation!.id,
          companyId,
          messages: context.conversation!.messages,
          turnState,
          status: "feedback_completed",
          feedback,
          turnMeta,
          plan,
        });
        feedbackHistories = await saveInterviewFeedbackHistory({
          conversationId: context.conversation!.id,
          companyId,
          identity,
          feedback,
          sourceMessagesSnapshot: context.conversation!.messages,
          sourceQuestionCount: context.conversation!.questionCount,
        });
      } catch (error) {
        if (reservationId) {
          await cancelReservation(reservationId);
        }
        throw error;
      }

      if (reservationId) {
        await confirmReservation(reservationId);
      }

      return {
        messages: context.conversation!.messages,
        questionCount: context.conversation!.questionCount,
        stageStatus:
          upstreamData.stage_status ?? {
            currentTopicLabel: "最終講評",
            coveredTopics: turnState.coveredTopics,
            remainingTopics: [],
          },
        questionStage: turnState.currentTopic,
        focus: null,
        feedback,
        questionFlowCompleted: true,
        creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
        turnState,
        turnMeta,
        plan,
        feedbackHistories,
      };
    },
    onAbort: async () => {
      if (reservationId) {
        await cancelReservation(reservationId);
      }
    },
    onError: async () => {
      if (reservationId) {
        await cancelReservation(reservationId);
      }
    },
  });
}
