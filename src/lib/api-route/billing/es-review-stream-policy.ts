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

    const reservation = await reserveCredits(
      ctx.userId,
      creditCost,
      "es_review",
      ctx.documentId,
      `ES添削: ${ctx.documentId}`,
    );
    if (!reservation.success) {
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
    await confirmReservation(reservationId).catch(console.error);
  },

  async cancel(
    _ctx: EsReviewStreamBillingContext,
    reservationId: string | null,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    await cancelReservation(reservationId).catch(console.error);
  },
};
