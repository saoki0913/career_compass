import {
  CONVERSATION_CREDITS_PER_TURN,
  cancelReservation,
  confirmReservation,
  confirmReservationInTx,
  reserveCredits,
  type CreditsTransaction,
} from "@/lib/credits";
import { logError } from "@/lib/logger";
import type { BillingOutcome, BillingPolicy, BillingPrecheckResult, BillingReserveResult } from "./types";

export interface GakuchikaStreamBillingContext {
  userId: string;
  gakuchikaId: string;
  newQuestionCount: number;
}

export const gakuchikaStreamPolicy: BillingPolicy<GakuchikaStreamBillingContext> = {
  async precheck(): Promise<BillingPrecheckResult> {
    return { ok: true, freeQuotaAvailable: false };
  },

  async reserve(ctx): Promise<BillingReserveResult> {
    const reservation = await reserveCredits(
      ctx.userId,
      CONVERSATION_CREDITS_PER_TURN,
      "gakuchika",
      ctx.gakuchikaId,
      `ガクチカ深掘り: ${ctx.gakuchikaId}`,
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

  async confirm(ctx, outcome: BillingOutcome, reservationId: string | null): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (outcome.creditsConsumed <= 0 || !reservationId) {
      return;
    }
    const result = await confirmReservation(reservationId);
    if (!result.confirmed) {
      logError("gakuchika-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        userId: ctx.userId,
        gakuchikaId: ctx.gakuchikaId,
        reservationId,
        creditsConsumed: outcome.creditsConsumed,
      });
    }
  },

  async confirmInTx(
    tx: CreditsTransaction,
    ctx,
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
      // Roll back the caller's persistence tx on a failed claim so a turn is
      // never saved without being charged. Log first, then throw to unwind.
      logError("gakuchika-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        userId: ctx.userId,
        gakuchikaId: ctx.gakuchikaId,
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
      logError("gakuchika-reservation-cancel", error, {
        userId: ctx.userId,
        gakuchikaId: ctx.gakuchikaId,
        reservationId,
        reason,
      });
    });
  },
};
