import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { CONVERSATION_CREDITS_PER_TURN, consumeCredits, DEFAULT_INTERVIEW_SESSION_CREDIT_COST, hasEnoughCredits } from "@/lib/credits";
import {
  normalizeInterviewTurnMeta,
  type InterviewPlan,
  type InterviewTurnMeta,
} from "@/lib/interview/session";

import {
  buildInterviewContext,
  normalizeInterviewPlanValue,
  saveInterviewConversationProgress,
  saveInterviewTurnEvent,
  validateInterviewTurnState,
} from "..";
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

  const canPay = await hasEnoughCredits(identity.userId!, CONVERSATION_CREDITS_PER_TURN);
  if (!canPay) {
    return createApiErrorResponse(request, {
      status: 402,
      code: "INTERVIEW_INSUFFICIENT_CREDITS",
      userMessage: "クレジットが不足しています。",
      action: "プランをアップグレードするか、クレジットが補充されるまでお待ちください。",
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
      latest_feedback: {
        overall_comment: latestFeedback.overallComment,
        scores: latestFeedback.scores,
        strengths: latestFeedback.strengths,
        improvements: latestFeedback.improvements,
        improved_answer: latestFeedback.improvedAnswer,
        next_preparation: latestFeedback.nextPreparation,
        consistency_risks: latestFeedback.consistencyRisks,
        weakest_question_type: latestFeedback.weakestQuestionType,
        weakest_turn_id: latestFeedback.weakestTurnId,
        weakest_question_snapshot: latestFeedback.weakestQuestionSnapshot,
        weakest_answer_snapshot: latestFeedback.weakestAnswerSnapshot,
        premise_consistency: latestFeedback.premiseConsistency,
        satisfaction_score: latestFeedback.satisfactionScore,
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
      const turnMeta: InterviewTurnMeta | null = normalizeInterviewTurnMeta(upstreamData.turn_meta ?? null);
      const plan: InterviewPlan | null =
        normalizeInterviewPlanValue(upstreamData.interview_plan ?? null) ?? context.conversation!.plan ?? null;

      await saveInterviewConversationProgress({
        conversationId: context.conversation!.id,
        companyId,
        messages,
        turnState,
        status: "in_progress",
        turnMeta,
        plan,
      });
      await saveInterviewTurnEvent({
        conversationId: context.conversation!.id,
        companyId,
        identity,
        turnId:
          turnState.recentQuestionSummariesV2.at(-1)?.turnId ??
          `turn-${turnState.turnCount || context.conversation!.questionCount + 1}`,
        question,
        answer: "",
        questionType:
          typeof upstreamData.question_stage === "string"
            ? upstreamData.question_stage
            : turnState.currentTopic,
        turnState,
        turnMeta,
      });

      await consumeCredits(identity.userId!, CONVERSATION_CREDITS_PER_TURN, "interview", companyId);

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
        questionFlowCompleted: false,
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
