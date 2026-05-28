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
 *
 * confirmInTx decision table (company-fetch is intentionally NOT atomic with persistence —
 * deadlines are saved under an approval flag and free quota lives in a separate table, so the
 * confirm is never bundled into the deadline-persistence rollback boundary):
 *
 *   reservationId        | confirmInTx result                  | action
 *   ---------------------|-------------------------------------|-------------------------------------
 *   free-quota sentinel  | (not called)                        | no-op — usage was incremented at reserve time
 *   UUID (paid)          | confirmed: true                     | normal — reservation claimed in the passed tx
 *   UUID (paid)          | confirmed: false, status confirmed  | idempotent re-run — already charged; do nothing
 *   UUID (paid)          | confirmed: false, status other      | logError (severity high) for ops visibility;
 *                        |                                     | NO consumeCredits compensation (double-charge
 *                        |                                     | footgun), NO throw (deadlines already persisted
 *                        |                                     | and unrecoverable). Near-impossible: company-fetch
 *                        |                                     | completes in seconds while the cron TTL is 30 min.
 */

import {
  cancelReservation,
  confirmReservationInTx,
  getRemainingFreeFetches,
  getReservationStatusInTx,
  hasEnoughCredits,
  reserveCredits,
  type CreditsTransaction,
} from "@/lib/credits";
import { cancelMonthlyScheduleFreeUse, reserveMonthlyScheduleFreeUse } from "@/lib/company-info/usage";
import { logError } from "@/lib/logger";
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

  async confirmInTx(
    tx: CreditsTransaction,
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

    // Free-quota usage lives in a separate table and is confirmed by leaving the
    // reserved increment in place (no-op here). Only paid credit reservations
    // claim inside the passed tx.
    if (reservationId === FREE_SCHEDULE_RESERVATION_ID) {
      return;
    }

    const result = await confirmReservationInTx(tx, reservationId);
    if (result.confirmed) {
      return;
    }

    // Claim failed: the row already left `reserved`. Inspect the current status
    // (read-only, same tx) to tell an idempotent re-run apart from a genuinely
    // lost claim. Unlike the stream/inline policies, company-fetch never throws
    // here — the deadlines are already persisted and cannot be rolled back, so
    // throwing would turn a successful fetch into a failure response.
    const currentStatus = await getReservationStatusInTx(tx, reservationId);
    if (currentStatus === "confirmed") {
      // Already charged by a prior run. Idempotent: do not log or re-charge.
      return;
    }

    // Near-impossible for company-fetch (seconds-long request vs 30-min cron
    // TTL). Surface for ops visibility, but never auto-compensate via
    // consumeCredits — re-charging on an unverifiable claim is a double-charge
    // footgun, and the business rule charges on success only.
    logError(
      "company-fetch:confirm-could-not-claim-reserved",
      new Error("Credit reservation could not be claimed after billable success"),
      {
        reservationId,
        userId: ctx.userId,
        companyId: ctx.companyId,
        currentStatus,
        severity: "high",
      },
    );
  },

  async cancel(
    ctx: CompanyFetchBillingContext,
    reservationId: string | null,
    reason: string,
  ): Promise<void> {
    if (!reservationId) {
      return;
    }
    if (reservationId === FREE_SCHEDULE_RESERVATION_ID) {
      await cancelMonthlyScheduleFreeUse(ctx.userId);
      return;
    }
    // Surface a cancel that could not claim the reservation (already
    // confirmed/canceled/swept) or that threw, instead of silently dropping the
    // refund. A failed claim means no refund was applied for this id.
    try {
      const result = await cancelReservation(reservationId);
      if (!result.canceled) {
        logError(
          "company-fetch-reservation-cancel-not-applied",
          new Error("Credit reservation cancel did not claim a reserved row"),
          {
            reservationId,
            userId: ctx.userId,
            companyId: ctx.companyId,
            reason,
          },
        );
      }
    } catch (error: unknown) {
      logError("company-fetch-reservation-cancel", error, {
        reservationId,
        userId: ctx.userId,
        companyId: ctx.companyId,
        reason,
      });
    }
  },
};
