/**
 * Billing policy for ES review streaming.
 *
 * Semantics (preserved exactly from the previous inline implementation):
 * - Guests cannot use ES review — precheck rejects with 401.
 * - Logged-in users: credits are reserved up-front (subtracted from balance)
 *   via `reserveCredits`, confirmed via `confirmReservation` on successful
 *   completion, or refunded via `cancelReservation` on failure/cancel.
 * - Credit cost is computed by the route before invoking `reserve`.
 */

import {
  reserveCredits,
  confirmReservation,
  cancelReservation,
} from "@/lib/credits";
import { logError } from "@/lib/logger";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
  BillingReserveResult,
} from "./types";

export interface EsReviewStreamBillingContext {
  userId: string | null;
  guestId: string | null;
  documentId: string;
  creditCost: number;
  requestId?: string;
}

function structuredBillingErrorResponse(
  status: number,
  code: string,
  userMessage: string,
  action: string,
  requestId?: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        userMessage,
        action,
        retryable: status >= 500,
      },
      ...(requestId ? { requestId } : {}),
      ...(extra ?? {}),
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
    },
  );
}

export const esReviewStreamPolicy: BillingPolicy<EsReviewStreamBillingContext> = {
  async precheck(ctx): Promise<BillingPrecheckResult> {
    if (!ctx.userId) {
      return {
        ok: false,
        freeQuotaAvailable: false,
        errorResponse: structuredBillingErrorResponse(
          401,
          "ES_REVIEW_AUTH_REQUIRED",
          "AI添削機能を使用するにはログインが必要です。",
          "ログインしてから、もう一度お試しください。",
          ctx.requestId,
        ),
      };
    }
    return { ok: true, freeQuotaAvailable: false };
  },

  async reserve(
    ctx: EsReviewStreamBillingContext,
    creditCost: number,
  ): Promise<BillingReserveResult> {
    if (!ctx.userId) {
      return {
        reservationId: null,
        errorResponse: structuredBillingErrorResponse(
          401,
          "ES_REVIEW_AUTH_REQUIRED",
          "AI添削機能を使用するにはログインが必要です。",
          "ログインしてから、もう一度お試しください。",
          ctx.requestId,
        ),
      };
    }

    const reservation = await reserveCredits(
      ctx.userId,
      creditCost,
      "es_review",
      ctx.documentId,
      `ES添削: ${ctx.documentId}`,
    );
    if (!reservation.success) {
      if (reservation.errorCode === "BILLING_GATE_UNAVAILABLE") {
        return {
          reservationId: null,
          errorResponse: structuredBillingErrorResponse(
            503,
            "BILLING_GATE_UNAVAILABLE",
            "課金状態の確認に失敗しました。",
            "時間を置いて、もう一度お試しください。",
            ctx.requestId,
          ),
        };
      }
      return {
        reservationId: null,
        errorResponse: structuredBillingErrorResponse(
          402,
          "ES_REVIEW_CREDITS_INSUFFICIENT",
          "クレジットが不足しています。",
          "プランまたはクレジット残高を確認してください。",
          ctx.requestId,
          { creditCost },
        ),
      };
    }
    return { reservationId: reservation.reservationId };
  },

  async confirm(
    _ctx: EsReviewStreamBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (!reservationId) {
      return;
    }
    const result = await confirmReservation(reservationId);
    if (!result.confirmed) {
      logError("es-review-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        reservationId,
      });
    }
  },

  async cancel(
    ctx: EsReviewStreamBillingContext,
    reservationId: string | null,
    reason: string,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    await cancelReservation(reservationId).catch((error: unknown) => {
      logError("es-review-reservation-cancel", error, {
        reservationId,
        documentId: ctx.documentId,
        userId: ctx.userId,
        reason,
      });
    });
  },
};
