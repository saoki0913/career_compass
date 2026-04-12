import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createInitialInterviewTurnState, getInterviewStageStatus } from "@/lib/interview/session";

import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import { buildInterviewContext, resetInterviewConversation } from "..";

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

  let context;
  try {
    context = await buildInterviewContext(companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:reset",
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

  try {
    await resetInterviewConversation(companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:reset",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    conversation: {
      id: context.conversation?.id ?? null,
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
    feedbackHistories: context.feedbackHistories,
  });
}
