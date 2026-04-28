import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { generateGakuchikaSummaryWithTelemetry } from "@/app/api/gakuchika/summary-server";
import { getRequestId, logAiCreditCostSummary } from "@/lib/ai/cost-summary-log";
import { getCsrfFailureReason } from "@/lib/csrf";
import { computeTotalTokens, incrementDailyTokenCount } from "@/lib/llm-cost-limit";
import {
  getIdentity,
  isInterviewReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
} from "@/app/api/gakuchika";

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

    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(
      request,
      [...DRAFT_RATE_LAYERS],
      identity.userId,
      identity.guestId,
      "gakuchika_interview_summary",
    );
    if (rateLimited) return rateLimited;

    const messages = safeParseMessages(conversation.messages);
    const { summary, telemetry } = await generateGakuchikaSummaryWithTelemetry(
      gakuchika.title,
      conversationState.draftText,
      messages,
    );
    const persistedSummary = {
      ...summary,
      source_session_id: sessionId,
      source_draft_document_id: conversationState.draftDocumentId ?? null,
    };
    const nextState = {
      ...conversationState,
      summaryStale: false,
    };
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
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));
    logAiCreditCostSummary({
      feature: "gakuchika_interview_summary",
      requestId,
      status: "success",
      creditsUsed: 0,
      telemetry,
    });

    return NextResponse.json({
      summary,
      cached: false,
      conversationState: nextState,
    });
  } catch (error) {
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
