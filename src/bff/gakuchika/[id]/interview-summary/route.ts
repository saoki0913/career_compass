import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { guardDailyTokenLimit } from "@/bff/identity/llm-cost-guard";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { generateGakuchikaSummaryWithTelemetry } from "@/bff/gakuchika/summary-server";
import { getRequestId, logAiCreditCostSummary } from "@/lib/ai/cost-summary-log";
import { getCsrfFailureReason } from "@/lib/csrf";
import { computeTotalTokens, incrementDailyTokenCount } from "@/lib/llm-cost-limit";
import {
  cancelReservation,
  confirmReservationInTx,
  FEEDBACK_SUMMARY_CREDIT_COST,
  reserveCredits,
} from "@/lib/credits";
import { logError } from "@/lib/logger";
import {
  getIdentity,
  isInterviewReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
} from "@/bff/gakuchika";

function notFound(request: NextRequest) {
  return createApiErrorResponse(request, {
    status: 404,
    code: "GAKUCHIKA_INTERVIEW_SUMMARY_NOT_FOUND",
    userMessage: "面接フィードバックの対象が見つかりません。",
    action: "ページを再読み込みして、もう一度お試しください。",
  });
}

function safeParseSummaryRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 成功時のみ消費: 予約はキャッシュ判定の後に行い、失敗系の経路で必ず cancel する。
  let reservationId: string | null = null;
  try {
    const csrfFailure = getCsrfFailureReason(request);
    if (csrfFailure) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "CSRF_VALIDATION_FAILED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: `CSRF validation failed: ${csrfFailure}`,
      });
    }

    const identity = await getIdentity(request);
    if (!identity?.userId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "GAKUCHIKA_INTERVIEW_SUMMARY_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    const { id: gakuchikaId } = await params;
    const requestId = getRequestId(request);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_INTERVIEW_SUMMARY_INVALID_REQUEST",
        userMessage: "対象セッションが指定されていません。",
        action: "ページを再読み込みして、もう一度お試しください。",
      });
    }

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);
    if (!gakuchika || gakuchika.userId !== identity.userId) return notFound(request);

    const [conversation] = await db
      .select()
      .from(gakuchikaConversations)
      .where(and(
        eq(gakuchikaConversations.id, sessionId),
        eq(gakuchikaConversations.gakuchikaId, gakuchikaId),
      ))
      .limit(1);
    if (!conversation) return notFound(request);

    const conversationState = safeParseConversationState(conversation.starScores, conversation.status);
    if (!isInterviewReady(conversationState) || !conversationState.draftText) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "GAKUCHIKA_INTERVIEW_SUMMARY_NOT_READY",
        userMessage: "面接フィードバックを表示する準備がまだ整っていません。",
        action: "深掘りを完了してから、もう一度お試しください。",
      });
    }

    const summaryRecord = safeParseSummaryRecord(gakuchika.summary ?? null);
    const existingSummary = parseGakuchikaSummary(summaryRecord ?? gakuchika.summary ?? null);
    const sourceSessionId = typeof summaryRecord?.source_session_id === "string"
      ? summaryRecord.source_session_id
      : null;
    const sourceDraftDocumentId = typeof summaryRecord?.source_draft_document_id === "string"
      ? summaryRecord.source_draft_document_id
      : null;
    const isSameSummarySource =
      sourceSessionId === sessionId &&
      sourceDraftDocumentId === (conversationState.draftDocumentId ?? null);
    // キャッシュ命中は予約より前に return するため非課金。
    if (existingSummary && !conversationState.summaryStale && isSameSummarySource) {
      logAiCreditCostSummary({
        feature: "gakuchika_interview_summary",
        requestId,
        status: "success",
        creditsUsed: 0,
        telemetry: null,
      });
      return NextResponse.json({ summary: existingSummary, cached: true });
    }

    const limitResponse = await guardDailyTokenLimit(identity, request);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(
      request,
      [...DRAFT_RATE_LAYERS],
      identity.userId,
      identity.guestId,
      "gakuchika_interview_summary",
    );
    if (rateLimited) return rateLimited;

    // 認可・準備不足・キャッシュ判定をすべて通過したので、ここで初めて予約する。
    const reservation = await reserveCredits(
      identity.userId,
      FEEDBACK_SUMMARY_CREDIT_COST,
      "gakuchika_summary",
      gakuchikaId,
      `ガクチカ要点整理: ${gakuchika.title}`,
    );
    if (!reservation.success) {
      logAiCreditCostSummary({
        feature: "gakuchika_interview_summary",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      return createApiErrorResponse(request, {
        status: 402,
        code: "GAKUCHIKA_INTERVIEW_SUMMARY_CREDIT_SHORTAGE",
        userMessage: "クレジットが不足しています。",
        action: "プランをご確認のうえ、もう一度お試しください。",
      });
    }
    reservationId = reservation.reservationId;

    const messages = safeParseMessages(conversation.messages);
    const { summary, telemetry, source } = await generateGakuchikaSummaryWithTelemetry(
      gakuchika.title,
      conversationState.draftText,
      messages,
      {
        scope: "ai-stream",
        actor: { kind: "user", id: identity.userId },
        plan: "free",
      },
    );

    // fallback（LLM 失敗による代替生成）は成果物を保存しても課金しない。
    if (source !== "llm" && reservationId) {
      await cancelReservation(reservationId);
      reservationId = null;
    }

    const persistedSummary = {
      ...summary,
      source_session_id: sessionId,
      source_draft_document_id: conversationState.draftDocumentId ?? null,
    };
    const nextState = {
      ...conversationState,
      summaryStale: false,
    };

    // Persist the summary + conversation AND confirm the reservation in one
    // transaction so "saved" and "charged" share a single commit boundary. If
    // the reservation can no longer be claimed (already canceled/confirmed, or
    // swept by cleanup), the whole tx rolls back and the outer catch refunds;
    // we never deliver a saved-but-uncharged summary.
    let creditsUsed = 0;
    await db.transaction(async (tx) => {
      await tx
        .update(gakuchikaContents)
        .set({
          summary: JSON.stringify(persistedSummary),
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaContents.id, gakuchikaId));

      await tx
        .update(gakuchikaConversations)
        .set({
          starScores: serializeConversationState(nextState),
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaConversations.id, sessionId));

      if (reservationId) {
        const { confirmed } = await confirmReservationInTx(tx, reservationId);
        if (!confirmed) {
          throw new Error("credit reservation could not be confirmed");
        }
      }
    });
    if (reservationId) creditsUsed = FEEDBACK_SUMMARY_CREDIT_COST;
    reservationId = null;

    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));
    logAiCreditCostSummary({
      feature: "gakuchika_interview_summary",
      requestId,
      status: "success",
      creditsUsed,
      telemetry,
    });

    return NextResponse.json({
      summary,
      cached: false,
      conversationState: nextState,
    });
  } catch (error) {
    if (reservationId) {
      try {
        await cancelReservation(reservationId);
      } catch (cancelError) {
        logError("gakuchika-interview-summary:cancel-on-error", cancelError, { reservationId });
      }
    }
    logAiCreditCostSummary({
      feature: "gakuchika_interview_summary",
      requestId: getRequestId(request),
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_INTERVIEW_SUMMARY_FAILED",
      userMessage: "面接フィードバックの生成に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
      error,
      logContext: "GakuchikaInterviewSummary.POST",
    });
  }
}
