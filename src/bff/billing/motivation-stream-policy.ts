/**
 * Billing policy for motivation conversation streaming.
 *
 * Semantics:
 * - Every turn consumes CONVERSATION_CREDITS_PER_TURN (1) credit.
 * - Credits are reserved before the FastAPI stream starts, confirmed after the
 *   `complete` event and DB update commit, or refunded on failure/cancel.
 * - Guests and anonymous users never reach this policy (motivation streaming requires login).
 */

import {
  CONVERSATION_CREDITS_PER_TURN,
  cancelReservation,
  confirmReservation,
  confirmReservationInTx,
  reserveCredits,
  type CreditsTransaction,
} from "@/lib/credits";
import { logError } from "@/lib/logger";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
  BillingReserveResult,
} from "./types";

export interface MotivationStreamBillingContext {
  userId: string;
  newQuestionCount: number;
  companyId: string;
}

export const motivationStreamPolicy: BillingPolicy<MotivationStreamBillingContext> = {
  async precheck(ctx): Promise<BillingPrecheckResult> {
    if (!ctx.userId) {
      return { ok: true, freeQuotaAvailable: true };
    }

    return { ok: true, freeQuotaAvailable: false };
  },

  async reserve(ctx: MotivationStreamBillingContext): Promise<BillingReserveResult> {
    const reservation = await reserveCredits(
      ctx.userId,
      CONVERSATION_CREDITS_PER_TURN,
      "motivation",
      ctx.companyId,
      `志望動機深掘り: ${ctx.companyId}`,
    );
    if (!reservation.success) {
      return {
        reservationId: null,
        errorResponse: new Response(
          JSON.stringify({
            error:
              reservation.errorCode === "BILLING_GATE_UNAVAILABLE"
                ? {
                    code: "BILLING_GATE_UNAVAILABLE",
                    userMessage: "クレジットの確認に失敗しました。",
                    action: "時間を置いて、もう一度お試しください。",
                    retryable: true,
                  }
                : "クレジットが不足しています",
          }),
          {
            status: reservation.errorCode === "BILLING_GATE_UNAVAILABLE" ? 503 : 402,
            headers: { "Content-Type": "application/json" },
          },
        ),
      };
    }
    return { reservationId: reservation.reservationId };
  },

  async confirm(
    ctx: MotivationStreamBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (outcome.creditsConsumed <= 0 || !reservationId) {
      return;
    }
    const result = await confirmReservation(reservationId);
    if (!result.confirmed) {
      logError("motivation-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        userId: ctx.userId,
        companyId: ctx.companyId,
        reservationId,
        creditsConsumed: outcome.creditsConsumed,
      });
    }
  },

  async confirmInTx(
    tx: CreditsTransaction,
    ctx: MotivationStreamBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (outcome.creditsConsumed <= 0 || !reservationId) {
      return;
    }
    const result = await confirmReservationInTx(tx, reservationId);
    if (!result.confirmed) {
      // A failed claim (already canceled/confirmed or swept by cleanup) must roll
      // back the caller's persistence tx so we never deliver a saved-but-uncharged
      // turn. We log first, then throw so the surrounding transaction unwinds.
      logError("motivation-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        userId: ctx.userId,
        companyId: ctx.companyId,
        reservationId,
        creditsConsumed: outcome.creditsConsumed,
      });
      throw new Error("Credit reservation confirm returned false after billable success");
    }
  },

  async cancel(ctx, reservationId, reason): Promise<void> {
    if (!reservationId) {
      return;
    }
    await cancelReservation(reservationId).catch((error: unknown) => {
      logError("motivation-reservation-cancel", error, {
        userId: ctx.userId,
        companyId: ctx.companyId,
        reservationId,
        reason,
      });
    });
  },
};
