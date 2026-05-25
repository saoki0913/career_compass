/**
 * Motivation Feedback Summary API
 *
 * POST: 完成した志望動機を、面接で話せるフィードバックメモに整理する。
 *       成功時のみ 6 credits 消費。ログイン必須（guest 拒否）。
 *       キャッシュ命中・LLM失敗・空応答・DB保存失敗・confirm失敗はすべて非課金。
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import {
  cancelReservation,
  confirmReservation,
  FEEDBACK_SUMMARY_CREDIT_COST,
  reserveCredits,
} from "@/lib/credits";
import {
  resolveDraftReadyState,
  safeParseConversationContext,
  safeParseMessages,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/bff/identity/llm-cost-guard";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import { messageFromFastApiDetail } from "@/lib/server/fastapi-detail-message";
import {
  buildMotivationOwnerCondition,
  getOwnedMotivationCompanyData,
} from "@/lib/motivation/motivation-input-resolver";
import { logError } from "@/lib/logger";

interface FeedbackTitledItem {
  title: string;
  description: string;
}

interface FastAPIFeedbackSummaryResponse {
  one_line_core_answer: string;
  strengths: FeedbackTitledItem[];
  improvements: FeedbackTitledItem[];
  next_preparation: string[];
  likely_followup_questions: string[];
}

interface PersistedFeedbackSummary extends FastAPIFeedbackSummaryResponse {
  source_draft_document_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePersistedSummary(value: unknown): PersistedFeedbackSummary | null {
  if (!isRecord(value)) return null;
  if (typeof value.one_line_core_answer !== "string") return null;
  return value as unknown as PersistedFeedbackSummary;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const requestId = getRequestId(request);
  // 成功時のみ消費: 予約はキャッシュ判定の後に行い、失敗系では必ず cancel する。
  let reservationId: string | null = null;

  try {
    // --- 1. 認可: ログイン必須（guest 拒否） ---
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "MOTIVATION_FEEDBACK_SUMMARY_AUTH_REQUIRED",
        userMessage: "認証が必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }
    const { userId, guestId } = identity;
    if (!userId) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "MOTIVATION_FEEDBACK_SUMMARY_LOGIN_REQUIRED",
        userMessage: "志望動機のフィードバック整理はログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    // --- owner 検証（企業・会話） ---
    const company = await getOwnedMotivationCompanyData(companyId, identity);
    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "MOTIVATION_COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりません。",
        action: "ページを再読み込みして、もう一度お試しください。",
      });
    }
    const conversation = await getConversationByCondition(
      buildMotivationOwnerCondition(companyId, userId, guestId),
    );
    if (!conversation) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "MOTIVATION_CONVERSATION_NOT_FOUND",
        userMessage: "会話が見つかりません。",
        action: "ページを再読み込みして、もう一度お試しください。",
      });
    }

    // --- 2. 準備不足判定: draft 未生成は拒否（非課金） ---
    const messages = safeParseMessages(conversation.messages);
    const conversationContext = safeParseConversationContext(conversation.conversationContext ?? null);
    const { isDraftReady } = resolveDraftReadyState(
      conversationContext,
      conversation.status as "in_progress" | "completed" | null,
    );
    const generatedDraft = conversation.generatedDraft?.trim() ?? "";
    if (!isDraftReady || !generatedDraft) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "MOTIVATION_FEEDBACK_SUMMARY_NOT_READY",
        userMessage: "フィードバックを表示する準備がまだ整っていません。",
        action: "志望動機ESを作成してから、もう一度お試しください。",
      });
    }

    // --- 3. キャッシュ判定: 同一 draftDocumentId の保存済みサマリがあれば予約せず返す（非課金） ---
    const currentDraftDocumentId = conversationContext.draftDocumentId ?? null;
    const existingSummary = parsePersistedSummary(conversation.feedbackSummary ?? null);
    if (existingSummary && existingSummary.source_draft_document_id === currentDraftDocumentId) {
      logAiCreditCostSummary({
        feature: "motivation_summary",
        requestId,
        status: "success",
        creditsUsed: 0,
        telemetry: null,
      });
      return NextResponse.json({ summary: existingSummary, cached: true });
    }

    // --- rate / token guard（予約の直前） ---
    const limitResponse = await guardDailyTokenLimit(identity, request);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(
      request,
      [...DRAFT_RATE_LAYERS],
      userId,
      guestId,
      "motivation_feedback_summary",
    );
    if (rateLimited) return rateLimited;

    // --- 4. 予約（認可・準備不足・キャッシュ判定をすべて通過した後にのみ実行） ---
    const reservation = await reserveCredits(
      userId,
      FEEDBACK_SUMMARY_CREDIT_COST,
      "motivation_summary",
      companyId,
      `志望動機 要点整理: ${company.name}`,
    );
    if (!reservation.success) {
      logAiCreditCostSummary({
        feature: "motivation_summary",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      return createApiErrorResponse(request, {
        status: 402,
        code: "MOTIVATION_FEEDBACK_SUMMARY_CREDIT_SHORTAGE",
        userMessage: "クレジットが不足しています。",
        action: "プランをご確認のうえ、もう一度お試しください。",
      });
    }
    reservationId = reservation.reservationId;

    // --- FastAPI proxy（principal は scope:"company"。company_id 一致が必要） ---
    const principalPlan = await getViewerPlan(identity);
    const response = await fetchFastApiWithPrincipal("/api/motivation/feedback-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      principal: {
        scope: "company" as const,
        actor: { kind: "user" as const, id: userId },
        companyId,
        plan: principalPlan,
      },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        selected_role: conversationContext.selectedRole ?? null,
        conversation_history: messages,
        slot_summaries: conversationContext.slotSummaries ?? {},
        slot_evidence_sentences: conversationContext.slotEvidenceSentences ?? {},
        draft_text: generatedDraft,
      }),
    });

    // --- LLM 失敗は非課金 ---
    if (!response.ok) {
      if (reservationId) {
        await cancelReservation(reservationId);
        reservationId = null;
      }
      const errorData = await response.json().catch(() => ({}));
      logAiCreditCostSummary({
        feature: "motivation_summary",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      const detailMsg = messageFromFastApiDetail((errorData as { detail?: unknown }).detail);
      return createApiErrorResponse(request, {
        status: 503,
        code: "MOTIVATION_FEEDBACK_SUMMARY_FAILED",
        userMessage: detailMsg || "フィードバックの生成に失敗しました。",
        action: "時間をおいて、もう一度お試しください。",
        retryable: true,
      });
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIFeedbackSummaryResponse;

    // --- 空応答（fallback 相当）は非課金 ---
    if (!data.one_line_core_answer && (!data.strengths || data.strengths.length === 0)) {
      if (reservationId) {
        await cancelReservation(reservationId);
        reservationId = null;
      }
      logAiCreditCostSummary({
        feature: "motivation_summary",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return createApiErrorResponse(request, {
        status: 502,
        code: "MOTIVATION_FEEDBACK_SUMMARY_EMPTY",
        userMessage: "フィードバックの生成に失敗しました。",
        action: "時間をおいて、もう一度お試しください。",
        retryable: true,
      });
    }

    // --- DB 保存（feedbackSummary カラム）。保存失敗は非課金 ---
    const persisted: PersistedFeedbackSummary = {
      one_line_core_answer: data.one_line_core_answer,
      strengths: data.strengths ?? [],
      improvements: data.improvements ?? [],
      next_preparation: data.next_preparation ?? [],
      likely_followup_questions: data.likely_followup_questions ?? [],
      source_draft_document_id: currentDraftDocumentId,
    };
    try {
      await db
        .update(motivationConversations)
        .set({ feedbackSummary: persisted, updatedAt: new Date() })
        .where(eq(motivationConversations.id, conversation.id));
    } catch (dbError) {
      if (reservationId) {
        await cancelReservation(reservationId);
        reservationId = null;
      }
      throw dbError;
    }

    // --- confirm（保存成功後のみ）。confirm 失敗は cancel して非課金 ---
    let creditsUsed = 0;
    if (reservationId) {
      try {
        await confirmReservation(reservationId);
        creditsUsed = FEEDBACK_SUMMARY_CREDIT_COST;
      } catch (error) {
        logError("motivation-feedback-summary:confirm-reservation", error, {
          companyId,
          userId,
          requestId,
          reservationId,
        });
        try {
          await cancelReservation(reservationId);
        } catch (cancelError) {
          logError("motivation-feedback-summary:cancel-after-confirm-failure", cancelError, {
            companyId,
            userId,
            requestId,
            reservationId,
          });
        }
      } finally {
        reservationId = null;
      }
    }

    logAiCreditCostSummary({
      feature: "motivation_summary",
      requestId,
      status: "success",
      creditsUsed,
      telemetry,
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    return NextResponse.json({ summary: persisted, cached: false });
  } catch (error) {
    if (reservationId) {
      try {
        await cancelReservation(reservationId);
      } catch (cancelError) {
        logError("motivation-feedback-summary:cancel-on-error", cancelError, { requestId, reservationId });
      }
    }
    logError("motivation-feedback-summary", error, { companyId, requestId });
    logAiCreditCostSummary({
      feature: "motivation_summary",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return createApiErrorResponse(request, {
      status: 503,
      code: "MOTIVATION_FEEDBACK_SUMMARY_FAILED",
      userMessage: "フィードバックの生成中にエラーが発生しました。",
      action: "時間をおいて、もう一度お試しください。",
      retryable: true,
      error,
      logContext: "motivation-feedback-summary",
    });
  }
}
