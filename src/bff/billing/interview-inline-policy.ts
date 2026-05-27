/**
 * Billing policy for interview inline routes.
 *
 * Semantics:
 * - Routes authenticate users before invoking this policy.
 * - Credits are reserved up front, confirmed only after the interview result is
 *   persisted, and canceled on upstream/persistence failures.
 * - Routes keep their existing structured error responses for insufficient
 *   credits so client-visible behavior stays unchanged.
 */

import {
  cancelReservation,
  confirmReservation,
  confirmReservationInTx,
  reserveCredits,
  type CreditsTransaction,
  type TransactionType,
} from "@/lib/credits";
import { logError } from "@/lib/logger";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
  BillingReserveResult,
} from "./types";

export interface InterviewInlineBillingContext {
  userId: string;
  companyId: string;
  companyName: string;
  transactionType: Extract<TransactionType, "interview" | "interview_feedback">;
  descriptionPrefix: string;
}

export const interviewInlinePolicy: BillingPolicy<InterviewInlineBillingContext> = {
  async precheck(): Promise<BillingPrecheckResult> {
    return { ok: true, freeQuotaAvailable: false };
  },

  async reserve(
    ctx: InterviewInlineBillingContext,
    creditCost: number,
  ): Promise<BillingReserveResult> {
    const reservation = await reserveCredits(
      ctx.userId,
      creditCost,
      ctx.transactionType,
      ctx.companyId,
      `${ctx.descriptionPrefix}: ${ctx.companyName}`,
    );

    if (!reservation.success) {
      return { reservationId: null };
    }

    return { reservationId: reservation.reservationId };
  },

  async confirm(
    _ctx: InterviewInlineBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success" || !reservationId) {
      return;
    }
    const result = await confirmReservation(reservationId);
    if (!result.confirmed) {
      logError("interview-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        reservationId,
        userId: _ctx.userId,
        companyId: _ctx.companyId,
      });
    }
  },

  async confirmInTx(
    tx: CreditsTransaction,
    _ctx: InterviewInlineBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success" || !reservationId) {
      return;
    }
    const result = await confirmReservationInTx(tx, reservationId);
    if (!result.confirmed) {
      // Roll back the caller's persistence tx on a failed claim so an interview
      // turn/feedback is never saved without being charged. Log first, then throw.
      logError("interview-reservation-confirm-after-success-failed", new Error("Credit reservation confirm returned false after billable success"), {
        reservationId,
        userId: _ctx.userId,
        companyId: _ctx.companyId,
      });
      throw new Error("Credit reservation confirm returned false after billable success");
    }
  },

  async cancel(
    _ctx: InterviewInlineBillingContext,
    reservationId: string | null,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    await cancelReservation(reservationId);
  },
};
