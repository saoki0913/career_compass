/**
 * Billing policy for ES review streaming.
 *
 * Semantics (preserved exactly from the previous inline implementation):
 * - Guests cannot use ES review — precheck rejects with 401.
 * - Logged-in users: credits are reserved up-front (subtracted from balance)
 *   via `reserveCredits`, confirmed via `confirmReservation` on successful
 *   completion, or refunded via `cancelReservation` on failure/cancel.
 * - Billing gate schema drift fails closed as a retryable 503 before AI execution.
 * - Credit cost is computed by the route before invoking `reserve`.
 */

import {
  reserveCredits,
  confirmReservation,
  cancelReservation,
  isBillingGateUnavailableError,
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

function jsonErrorResponse(
  status: number,
  code: string,
  userMessage: string,
  action: string,
  retryable: boolean,
  requestId?: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        userMessage,
        action,
        retryable,
        ...(extra ? { extra } : {}),
      },
      ...(requestId ? { requestId } : {}),
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
        errorResponse: new Response(
          JSON.stringify({ error: "AI添削機能を使用するにはログインが必要です" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
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
        errorResponse: new Response(
          JSON.stringify({ error: "AI添削機能を使用するにはログインが必要です" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      };
    }

    let reservation: Awaited<ReturnType<typeof reserveCredits>>;
    try {
      reservation = await reserveCredits(
        ctx.userId,
        creditCost,
        "es_review",
        ctx.documentId,
        `ES添削: ${ctx.documentId}`,
      );
    } catch (error) {
      if (!isBillingGateUnavailableError(error)) {
        throw error;
      }
      logError("es-review-billing-gate-unavailable", error, {
        documentId: ctx.documentId,
        userId: ctx.userId,
      });
      return {
        reservationId: null,
        errorResponse: jsonErrorResponse(
          503,
          "BILLING_GATE_UNAVAILABLE",
          "課金状態の確認に失敗しました。",
          "時間をおいて再度お試しください。解消しない場合はサポートへお問い合わせください。",
          true,
          ctx.requestId,
          { creditCost },
        ),
      };
    }
    if (!reservation.success) {
      if (reservation.errorCode === "BILLING_GATE_UNAVAILABLE") {
        return {
          reservationId: null,
          errorResponse: jsonErrorResponse(
            503,
            "BILLING_GATE_UNAVAILABLE",
            "課金状態の確認に失敗しました。",
            "時間をおいて再度お試しください。解消しない場合はサポートへお問い合わせください。",
            true,
            ctx.requestId,
            { creditCost },
          ),
        };
      }
      if (
        reservation.errorCode === "BILLING_HOLD" ||
        reservation.errorCode === "SUBSCRIPTION_BLOCKED"
      ) {
        return {
          reservationId: null,
          errorResponse: jsonErrorResponse(
            402,
            reservation.errorCode,
            "お支払い状態の確認が必要です。",
            "支払い状況を確認してから、もう一度お試しください。",
            false,
            ctx.requestId,
            { creditCost },
          ),
        };
      }
      return {
        reservationId: null,
        errorResponse: new Response(
          JSON.stringify({ error: "クレジットが不足しています", creditCost }),
          { status: 402, headers: { "Content-Type": "application/json" } },
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
    await confirmReservation(reservationId);
  },

  async cancel(
    ctx: EsReviewStreamBillingContext,
    reservationId: string | null,
    reason: string,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    try {
      await cancelReservation(reservationId);
    } catch (error) {
      logError("es-review-reservation-cancel", error, {
        reservationId,
        documentId: ctx.documentId,
        userId: ctx.userId,
        reason,
      });
    }
  },
};
