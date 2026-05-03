import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import {
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
  INTERVIEW_CONTINUE_CREDIT_COST,
  INTERVIEW_START_CREDIT_COST,
  INTERVIEW_TURN_CREDIT_COST,
} from "@/lib/credits";
import { createInitialInterviewTurnState, getInterviewStageStatus } from "@/lib/interview/session";

import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "./persistence-errors";
import { buildInterviewContext } from ".";

const INTERVIEW_BILLING_COSTS = {
  start: INTERVIEW_START_CREDIT_COST,
  turn: INTERVIEW_TURN_CREDIT_COST,
  continue: INTERVIEW_CONTINUE_CREDIT_COST,
  feedback: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
} as const;

export async function GET(
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
      operation: "interview:get",
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

  return NextResponse.json({
    company: {
      id: context.company.id,
      name: context.company.name,
      industry: context.company.industry,
    },
    creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
    billingCosts: INTERVIEW_BILLING_COSTS,
    sessionState: {
      status: context.conversation?.status ?? "setup_pending",
      isActive: Boolean(context.conversation && context.conversation.status !== "setup_pending"),
      isLegacySession: Boolean(context.conversation?.isLegacySession),
      questionCount: context.conversation?.questionCount ?? 0,
      hasFeedback: Boolean(context.conversation?.feedback),
    },
    materials: context.materials,
    setup: context.setup,
    feedbackHistories: context.feedbackHistories,
    conversation:
      context.conversation ??
      {
        id: null,
        status: "setup_pending",
        messages: [],
        feedback: null,
        plan: null,
        turnMeta: null,
        questionCount: 0,
        questionStage: null,
        questionFlowCompleted: false,
        stageStatus: getInterviewStageStatus({
          currentTopicLabel: null,
          coveredTopics: [],
          remainingTopics: [],
        }),
        turnState: createInitialInterviewTurnState(),
        selectedIndustry: context.setup.selectedIndustry,
        selectedRole: context.setup.selectedRole,
        selectedRoleSource: context.setup.selectedRoleSource,
        roleTrack: context.setup.roleTrack,
        interviewFormat: context.setup.interviewFormat,
        selectionType: context.setup.selectionType,
        interviewStage: context.setup.interviewStage,
        interviewerType: context.setup.interviewerType,
        strictnessMode: context.setup.strictnessMode,
        isLegacySession: false,
      },
    stageStatus:
      context.conversation?.stageStatus ??
      getInterviewStageStatus({
        currentTopicLabel: null,
        coveredTopics: [],
        remainingTopics: [],
      }),
    turnState: context.conversation?.turnState ?? createInitialInterviewTurnState(),
  });
}
