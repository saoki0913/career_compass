import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  cancelReservation,
  confirmReservation,
  INTERVIEW_TURN_CREDIT_COST,
  reserveCredits,
} from "@/lib/credits";

import { buildInterviewContext } from "..";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../persistence-errors";
import { createInterviewUpstreamStream } from "../stream-utils";
import {
  buildInterviewTurnPayload,
  completeInterviewTurnStream,
} from "./turn-service";

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

  if (
    context.conversation.isLegacySession ||
    context.conversation.status !== "in_progress" ||
    context.conversation.questionFlowCompleted ||
    context.conversation.turnState?.nextAction === "feedback"
  ) {
    return createApiErrorResponse(request, {
      status: 409,
      code: "INTERVIEW_NOT_ANSWERABLE",
      userMessage: "この面接セッションには回答できません。",
      action: "続きから練習するか、新しい面接を開始してください。",
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

  const reservation = await reserveCredits(
    identity.userId!,
    INTERVIEW_TURN_CREDIT_COST,
    "interview",
    companyId,
    `面接対策回答: ${context.company.name}`,
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

  let streamPayload: Awaited<ReturnType<typeof buildInterviewTurnPayload>>;
  try {
    streamPayload = await buildInterviewTurnPayload({
      context: { ...context, conversation: context.conversation },
      companyId,
      identity,
      answer,
    });
  } catch (error) {
    await cancelReservation(reservationId);
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
    identity,
    companyId,
    upstreamPath: "/api/interview/turn",
    upstreamPayload: streamPayload.upstreamPayload,
    onComplete: async (upstreamData) => {
      try {
        return await completeInterviewTurnStream({
          upstreamData,
          context: { ...context, conversation: context.conversation! },
          companyId,
          identity,
          answer,
          nextMessages: streamPayload.nextMessages,
          onPersisted: () => confirmReservation(reservationId),
        });
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
