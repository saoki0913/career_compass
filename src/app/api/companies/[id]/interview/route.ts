import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { createInitialInterviewTurnState, getInterviewStageStatus } from "@/lib/interview/session";

import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "./persistence-errors";
import { buildInterviewContext } from "./shared";

export async function GET(
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
    questionModel: "GPT-5.4 mini",
    feedbackModel: "Claude Sonnet 4.6",
    model: "GPT-5.4 mini",
    creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
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
        questionCount: 0,
        questionStage: "industry_reason",
        questionFlowCompleted: false,
        stageStatus: getInterviewStageStatus("industry_reason"),
        turnState: createInitialInterviewTurnState(),
        selectedIndustry: context.setup.selectedIndustry,
        selectedRole: context.setup.selectedRole,
        selectedRoleSource: context.setup.selectedRoleSource,
      },
    stageStatus:
      context.conversation?.stageStatus ?? getInterviewStageStatus("industry_reason"),
    turnState: context.conversation?.turnState ?? createInitialInterviewTurnState(),
  });
}
