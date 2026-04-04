import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../../persistence-errors";
import { saveInterviewFeedbackSatisfaction } from "../../shared";

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
  let body: { historyId?: string; satisfactionScore?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const historyId = typeof body.historyId === "string" ? body.historyId.trim() : "";
  const satisfactionScore =
    typeof body.satisfactionScore === "number" && Number.isFinite(body.satisfactionScore)
      ? Math.floor(body.satisfactionScore)
      : NaN;

  if (!historyId || satisfactionScore < 1 || satisfactionScore > 5) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_SATISFACTION_INVALID",
      userMessage: "満足度の保存に必要な情報が不足しています。",
      action: "1〜5 の満足度を選んで、もう一度お試しください。",
    });
  }

  try {
    const updated = await saveInterviewFeedbackSatisfaction({
      companyId,
      identity,
      historyId,
      satisfactionScore,
    });

    if (!updated) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "INTERVIEW_FEEDBACK_HISTORY_NOT_FOUND",
        userMessage: "保存対象の講評履歴が見つかりません。",
        action: "ページを更新してから、もう一度お試しください。",
      });
    }

    return NextResponse.json({
      ok: true,
      historyId,
      satisfactionScore,
    });
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:feedback-satisfaction",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
}
