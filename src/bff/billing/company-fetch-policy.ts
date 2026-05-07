/**
 * Billing policy for company schedule fetch.
 *
 * Semantics (preserved exactly from the previous inline implementation):
 * - Guests cannot use this feature — they are rejected upstream (401) before this policy is invoked.
 * - Logged-in users: monthly free quota is reserved first. If quota is exhausted, 1 credit is
 *   reserved. Reservations are confirmed only after deadlines are persisted and canceled on
 *   failures, preserving the "consume on success only" rule without TOCTOU overuse.
 * - precheck() does NOT set errorResponse — the route retains createApiErrorResponse() so the
 *   402 error shape (with code/userMessage/action/requestId) is preserved for the client.
 */

import {
  cancelReservation,
  confirmReservation,
  getRemainingFreeFetches,
  hasEnoughCredits,
  reserveCredits,
} from "@/lib/credits";
import { cancelMonthlyScheduleFreeUse, reserveMonthlyScheduleFreeUse } from "@/lib/company-info/usage";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
} from "./types";

export interface CompanyFetchBillingContext {
  /** Always a logged-in user ID. Guests are rejected upstream before this policy runs. */
  userId: string;
  /** Kept for interface symmetry with other policies; always null for this feature. */
  guestId: null;
  companyId: string;
  companyName: string;
  plan: "free" | "standard" | "pro";
}

const FREE_SCHEDULE_RESERVATION_ID = "schedule-free-quota";

export const companyFetchPolicy: BillingPolicy<CompanyFetchBillingContext> = {
  async precheck(ctx): Promise<BillingPrecheckResult> {
    const freeRemaining = await getRemainingFreeFetches(ctx.userId, null, ctx.plan);
    if (freeRemaining > 0) {
      return { ok: true, freeQuotaAvailable: true };
    }

    const canPay = await hasEnoughCredits(ctx.userId, 1);
    if (!canPay) {
      // Return ok: false with no errorResponse — the route builds the structured
      // 402 response via createApiErrorResponse() to preserve code/userMessage/action fields.
      return { ok: false, freeQuotaAvailable: false };
    }

    return { ok: true, freeQuotaAvailable: false };
  },

  async reserve(
    ctx: CompanyFetchBillingContext,
  ) {
    const freeReserved = await reserveMonthlyScheduleFreeUse(ctx.userId, ctx.plan);
    if (freeReserved) {
      return { reservationId: FREE_SCHEDULE_RESERVATION_ID };
    }

    const reservation = await reserveCredits(
      ctx.userId,
      1,
      "company_fetch",
      ctx.companyId,
      `選考スケジュール取得: ${ctx.companyName}`,
    );
    if (!reservation.success) {
      return { reservationId: null };
    }

    return { reservationId: reservation.reservationId };
  },

  async confirm(
    ctx: CompanyFetchBillingContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }

    if (!reservationId) {
      throw new Error("Missing company fetch billing reservation");
    }

    if (reservationId !== FREE_SCHEDULE_RESERVATION_ID) {
      await confirmReservation(reservationId);
    }
  },

  async cancel(
    ctx: CompanyFetchBillingContext,
    reservationId: string | null,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    if (reservationId === FREE_SCHEDULE_RESERVATION_ID) {
      await cancelMonthlyScheduleFreeUse(ctx.userId);
      return;
    }
    await cancelReservation(reservationId);
  },
};
