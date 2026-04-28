import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  cancelReservation,
  confirmReservation,
  INTERVIEW_START_CREDIT_COST,
  reserveCredits,
} from "@/lib/credits";
import {
  classifyInterviewRoleTrack,
  INTERVIEW_STAGE_OPTIONS,
  parseInterviewFormatParam,
  INTERVIEWER_TYPE_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
  createInitialInterviewTurnState,
  getInterviewStageStatus,
  normalizeInterviewTurnMeta,
  type InterviewPlan,
  type InterviewTurnMeta,
} from "@/lib/interview/session";

import {
  buildInterviewContext,
  ensureInterviewConversation,
  normalizeInterviewPlanValue,
  saveInterviewConversationProgress,
  saveInterviewTurnEvent,
  validateInterviewTurnState,
} from "..";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import {
  createInterviewUpstreamStream,
} from "../stream-utils";

function buildSeedSummary(materials: Array<{ kind?: string; label: string; text: string }>) {
  return materials
    .filter((material) => material.kind === "industry_seed" || material.kind === "company_seed")
    .map((material) => `${material.label}: ${material.text}`)
    .join("\n");
}

export function GET(request: NextRequest) {
  const res = createApiErrorResponse(request, {
    status: 405,
    code: "METHOD_NOT_ALLOWED",
    userMessage: "この操作は POST で送信してください。",
    action: "ページを再読み込みしてから、もう一度お試しください。",
    developerMessage: "GET is not supported for /api/companies/[id]/interview/start",
  });
  res.headers.set("Allow", "POST");
  return res;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: companyId } = await params;

  const identity = await getRequestIdentity(request);
  if (!identity?.userId) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "ログインが必要です。",
      action: "ログインしてから、もう一度お試しください。",
    });
  }

  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return limitResponse;

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
  const roleTrack = classifyInterviewRoleTrack(selectedRole);
  const interviewFormat = parseInterviewFormatParam((body as { interviewFormat?: string | null }).interviewFormat);
  const selectionType =
    typeof (body as { selectionType?: string | null }).selectionType === "string" &&
    SELECTION_TYPE_OPTIONS.includes((body as { selectionType?: string | null }).selectionType!.trim() as (typeof SELECTION_TYPE_OPTIONS)[number])
      ? ((body as { selectionType?: string | null }).selectionType!.trim() as (typeof SELECTION_TYPE_OPTIONS)[number])
      : null;
  const interviewStage =
    typeof (body as { interviewStage?: string | null }).interviewStage === "string" &&
    INTERVIEW_STAGE_OPTIONS.includes((body as { interviewStage?: string | null }).interviewStage!.trim() as (typeof INTERVIEW_STAGE_OPTIONS)[number])
      ? ((body as { interviewStage?: string | null }).interviewStage!.trim() as (typeof INTERVIEW_STAGE_OPTIONS)[number])
      : null;
  const interviewerType =
    typeof (body as { interviewerType?: string | null }).interviewerType === "string" &&
    INTERVIEWER_TYPE_OPTIONS.includes((body as { interviewerType?: string | null }).interviewerType!.trim() as (typeof INTERVIEWER_TYPE_OPTIONS)[number])
      ? ((body as { interviewerType?: string | null }).interviewerType!.trim() as (typeof INTERVIEWER_TYPE_OPTIONS)[number])
      : null;
  const strictnessMode =
    typeof (body as { strictnessMode?: string | null }).strictnessMode === "string" &&
    STRICTNESS_MODE_OPTIONS.includes((body as { strictnessMode?: string | null }).strictnessMode!.trim() as (typeof STRICTNESS_MODE_OPTIONS)[number])
      ? ((body as { strictnessMode?: string | null }).strictnessMode!.trim() as (typeof STRICTNESS_MODE_OPTIONS)[number])
      : null;

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

  if (!interviewFormat || !selectionType || !interviewStage || !interviewerType || !strictnessMode) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_SETUP_REQUIRED",
      userMessage: "面接方式、選考種別、面接段階、面接官タイプ、厳しさを確認してください。",
      action: "開始前の設定をすべて選択してから、もう一度お試しください。",
    });
  }

  if (context.conversation && context.conversation.status !== "setup_pending") {
    return createApiErrorResponse(request, {
      status: 409,
      code: "INTERVIEW_SESSION_ALREADY_ACTIVE",
      userMessage: "進行中の面接対策があります。",
      action: "続きから再開するか、会話をやり直す操作を選んでから新しく開始してください。",
    });
  }

  const reservation = await reserveCredits(
    identity.userId!,
    INTERVIEW_START_CREDIT_COST,
    "interview",
    companyId,
    `面接対策開始: ${context.company.name}`,
  );
  if (!reservation.success) {
    return createApiErrorResponse(request, {
      status: 402,
      code: "INTERVIEW_INSUFFICIENT_CREDITS",
      userMessage: "クレジットが不足しています。",
      action: "プランをアップグレードするか、クレジットが補充されるまでお待ちください。",
    });
  }
  const reservationId = reservation.reservationId;

  let conversation;
  try {
    conversation = await ensureInterviewConversation(companyId, identity, {
      selectedIndustry,
      selectedRole,
      selectedRoleSource,
      resolvedIndustry: context.setup.resolvedIndustry,
      requiresIndustrySelection: context.setup.requiresIndustrySelection,
      industryOptions: context.setup.industryOptions,
      roleTrack,
      interviewFormat,
      selectionType,
      interviewStage,
      interviewerType,
      strictnessMode,
    });
  } catch (error) {
    await cancelReservation(reservationId);
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:start",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }

  return createInterviewUpstreamStream({
    request,
    identity,
    companyId,
    upstreamPath: "/api/interview/start",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      academic_summary: context.academicSummary,
      research_summary: context.researchSummary,
      es_summary: context.esSummary,
      selected_industry: selectedIndustry,
      selected_role: selectedRole,
      selected_role_source: selectedRoleSource,
      role_track: roleTrack,
      interview_format: interviewFormat,
      selection_type: selectionType,
      interview_stage: interviewStage,
      interviewer_type: interviewerType,
      strictness_mode: strictnessMode,
      seed_summary: buildSeedSummary(context.materials),
    },
    onComplete: async (upstreamData) => {
      try {
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
        const turnMeta: InterviewTurnMeta | null = normalizeInterviewTurnMeta(upstreamData.turn_meta ?? null);
        const plan: InterviewPlan | null = normalizeInterviewPlanValue(upstreamData.interview_plan ?? null);

        await saveInterviewConversationProgress({
          conversationId: conversation.id,
          companyId,
          messages,
          turnState: turnStateToPersist,
          status: "in_progress",
          turnMeta,
          plan,
        });
        await saveInterviewTurnEvent({
          conversationId: conversation.id,
          companyId,
          identity,
          turnId:
            turnStateToPersist.recentQuestionSummariesV2.at(-1)?.turnId ??
            `turn-${turnStateToPersist.turnCount || 1}`,
          question,
          answer: "",
          questionType: "opening",
          turnState: turnStateToPersist,
          turnMeta,
          versionMetadata: {
            promptVersion: upstreamData.prompt_version ?? null,
            followupPolicyVersion: upstreamData.followup_policy_version ?? null,
            caseSeedVersion: upstreamData.case_seed_version ?? null,
          },
        });

        await confirmReservation(reservationId);

        return {
          messages,
          questionCount: turnStateToPersist.turnCount,
          stageStatus:
            upstreamData.stage_status ??
            getInterviewStageStatus({
              currentTopicLabel: turnMeta?.interviewSetupNote ?? turnStateToPersist.currentTopic,
              coveredTopics: turnStateToPersist.coveredTopics,
              remainingTopics: turnStateToPersist.remainingTopics,
            }),
          questionStage:
            typeof upstreamData.question_stage === "string" && upstreamData.question_stage.length > 0
              ? upstreamData.question_stage
              : turnStateToPersist.currentTopic,
          focus:
            typeof upstreamData.focus === "string" && upstreamData.focus.trim().length > 0
              ? upstreamData.focus.trim()
              : turnMeta?.topic ?? turnStateToPersist.currentTopic,
          feedback: null,
          questionFlowCompleted: false,
          creditCost: INTERVIEW_START_CREDIT_COST,
          turnState: turnStateToPersist,
          turnMeta,
          plan,
          transitionLine,
          feedbackHistories: context.feedbackHistories,
        };
      } catch (error) {
        await cancelReservation(reservationId);
        throw error;
      }
    },
    onAbort: async () => {
      await cancelReservation(reservationId);
    },
    onError: async () => {
      await cancelReservation(reservationId);
    },
  });
}
