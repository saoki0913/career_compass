/**
 * Billing policy for company schedule fetch.
 *
 * Semantics (preserved exactly from the previous inline implementation):
 * - Guests cannot use this feature — they are rejected upstream (401) before this policy is invoked.
 * - Logged-in users: monthly free quota is checked first. If quota remains, it is consumed
 *   post-success via incrementMonthlyScheduleFreeUse(). If quota is exhausted, 1 credit is
 *   required; credits are consumed post-success via consumeCredits().
 * - No reserve/confirm split — credits and free quota are consumed after the backend call
 *   succeeds and deadlines are persisted. This preserves the "consume on success only" rule.
 * - precheck() does NOT set errorResponse — the route retains createApiErrorResponse() so the
 *   402 error shape (with code/userMessage/action/requestId) is preserved for the client.
 */

import { getRemainingFreeFetches, hasEnoughCredits, consumeCredits } from "@/lib/credits";
import { incrementMonthlyScheduleFreeUse } from "@/lib/company-info/usage";
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

  async confirm(
    ctx: CompanyFetchBillingContext,
    outcome: BillingOutcome,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }

    if (outcome.freeQuotaUsed) {
      await incrementMonthlyScheduleFreeUse(ctx.userId);
    } else {
      const result = await consumeCredits(
        ctx.userId,
        1,
        "company_fetch",
        ctx.companyId,
        `選考スケジュール取得: ${ctx.companyName}`,
      );
      if (!result.success) {
        throw new Error("Insufficient credits for company info usage");
      }
    }
  },

  async cancel(): Promise<void> {
    // No reservation exists for company-fetch; cancel is a no-op.
  },
};
