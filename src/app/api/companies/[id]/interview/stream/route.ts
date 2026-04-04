import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import {
  normalizeInterviewTurnMeta,
  type InterviewPlan,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";

import {
  buildInterviewContext,
  listInterviewTurnEvents,
  normalizeInterviewPlanValue,
  saveInterviewConversationProgress,
  saveInterviewTurnEvent,
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

function getLatestAssistantQuestion(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
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

  let turnEvents: Awaited<ReturnType<typeof listInterviewTurnEvents>> = [];
  try {
    turnEvents = await listInterviewTurnEvents({
      conversationId: context.conversation.id,
      companyId,
      identity,
      limit: 24,
    });
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

  return createInterviewUpstreamStream({
    request,
    upstreamPath: "/api/interview/turn",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      academic_summary: context.academicSummary,
      research_summary: context.researchSummary,
      es_summary: context.esSummary,
      conversation_history: nextMessages,
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
      const turnMeta: InterviewTurnMeta | null = normalizeInterviewTurnMeta(upstreamData.turn_meta ?? null);
      const plan: InterviewPlan | null = normalizeInterviewPlanValue(upstreamData.interview_plan ?? null);
      const questionFlowCompleted =
        Boolean(upstreamData.question_flow_completed) ||
        (turnState as InterviewTurnState).nextAction === "feedback";
      const status = questionFlowCompleted ? "question_flow_completed" : "in_progress";

      await saveInterviewConversationProgress({
        conversationId: context.conversation!.id,
        companyId,
        messages,
        turnState,
        status,
        turnMeta,
        plan,
      });
      await saveInterviewTurnEvent({
        conversationId: context.conversation!.id,
        companyId,
        identity,
        turnId:
          context.conversation!.turnState.recentQuestionSummariesV2.at(-1)?.turnId ??
          `turn-${context.conversation!.questionCount || context.conversation!.turnState.turnCount || 1}`,
        question: getLatestAssistantQuestion(context.conversation!.messages),
        answer,
        questionType:
          typeof context.conversation!.turnState.currentTopic === "string"
            ? context.conversation!.turnState.currentTopic
            : null,
        turnState: context.conversation!.turnState,
        turnMeta: context.conversation!.turnMeta,
      });

      return {
        messages,
        questionCount: turnState.turnCount,
        stageStatus:
          upstreamData.stage_status ?? {
            currentTopicLabel: turnMeta?.interviewSetupNote ?? turnState.currentTopic,
            coveredTopics: turnState.coveredTopics,
            remainingTopics: turnState.remainingTopics,
          },
        questionStage:
          typeof upstreamData.question_stage === "string"
            ? upstreamData.question_stage
            : turnState.currentTopic,
        focus:
          typeof upstreamData.focus === "string" && upstreamData.focus.trim().length > 0
            ? upstreamData.focus.trim()
            : turnMeta?.topic ?? turnState.currentTopic,
        feedback: null,
        questionFlowCompleted,
        creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
        turnState,
        turnMeta,
        plan,
        transitionLine,
        feedbackHistories: context.feedbackHistories,
      };
    },
  });
}
