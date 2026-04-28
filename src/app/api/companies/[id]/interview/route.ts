import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
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

const INTERVIEW_MODEL_LABELS = {
  plan: "GPT-5.4",
  question: "Claude Haiku 4.5",
  feedback: "Claude Sonnet 4.6",
} as const;

const INTERVIEW_BILLING_COSTS = {
  start: INTERVIEW_START_CREDIT_COST,
  turn: INTERVIEW_TURN_CREDIT_COST,
  continue: INTERVIEW_CONTINUE_CREDIT_COST,
  feedback: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
} as const;

function buildMaterialReadiness(context: NonNullable<Awaited<ReturnType<typeof buildInterviewContext>>>) {
  const materialKinds = new Set(context.materials.map((material) => material.kind));
  const hasCompanySeed = materialKinds.has("company_seed") || materialKinds.has("industry_seed");
  const items = [
    {
      key: "motivation",
      label: "志望動機",
      ready: Boolean(context.motivationSummary),
      helper: "企業適合度と志望理由の深掘り精度が上がります。",
    },
    {
      key: "gakuchika",
      label: "ガクチカ",
      ready: Boolean(context.gakuchikaSummary),
      helper: "経験の具体性や再現性を確認しやすくなります。",
    },
    {
      key: "es",
      label: "関連ES",
      ready: Boolean(context.esSummary),
      helper: "ES と面接回答の一貫性チェックが強くなります。",
    },
    {
      key: "companyInfo",
      label: "企業情報",
      ready: Boolean(context.companySummary || hasCompanySeed),
      helper: "企業別の質問と比較論点を作りやすくなります。",
    },
    {
      key: "academic",
      label: "学業・研究",
      ready: Boolean(context.academicSummary || context.researchSummary),
      helper: "学業・研究に関する深掘りに備えやすくなります。",
    },
    {
      key: "feedbackHistory",
      label: "過去講評",
      ready: context.feedbackHistories.length > 0,
      helper: "前回の弱点を踏まえた練習につなげられます。",
    },
  ] as const;
  const readyCount = items.filter((item) => item.ready).length;
  const status = readyCount >= 4 ? "strong" : readyCount >= 2 ? "partial" : "thin";
  const summary =
    status === "strong"
      ? "企業別の面接材料がかなり揃っています。"
      : status === "partial"
        ? "主要材料の一部が揃っています。不足分がある場合も開始できます。"
        : "材料が少なめです。企業情報を軸に開始できますが、回答の個別性は追加材料で上がります。";

  return { status, summary, items };
}

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
    models: INTERVIEW_MODEL_LABELS,
    planModel: INTERVIEW_MODEL_LABELS.plan,
    questionModel: INTERVIEW_MODEL_LABELS.question,
    feedbackModel: INTERVIEW_MODEL_LABELS.feedback,
    model: INTERVIEW_MODEL_LABELS.question,
    creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
    billingCosts: INTERVIEW_BILLING_COSTS,
    materialReadiness: buildMaterialReadiness(context),
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
