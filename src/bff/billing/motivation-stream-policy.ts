/**
 * Billing policy for motivation conversation streaming.
 *
 * Semantics:
 * - Every turn consumes CONVERSATION_CREDITS_PER_TURN (1) credit.
 * - No reserve/confirm split — credits are consumed post-success after the FastAPI
 *   `complete` event and after the DB update committed.
 * - Guests and anonymous users never reach this policy (motivation streaming requires login).
 */

import { CONVERSATION_CREDITS_PER_TURN, consumeCredits, hasEnoughCredits } from "@/lib/credits";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
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

    const canPay = await hasEnoughCredits(ctx.userId, CONVERSATION_CREDITS_PER_TURN);
    if (!canPay) {
      return {
        ok: false,
        freeQuotaAvailable: false,
        errorResponse: new Response(
          JSON.stringify({ error: "クレジットが不足しています" }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
      };
    }
    return { ok: true, freeQuotaAvailable: false };
  },

  async confirm(
    ctx: MotivationStreamBillingContext,
    outcome: BillingOutcome,
  ): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (outcome.creditsConsumed <= 0) {
      return;
    }
    await consumeCredits(
      ctx.userId,
      outcome.creditsConsumed,
      "motivation",
      ctx.companyId,
    );
  },

  async cancel(): Promise<void> {
    // No reservation exists for motivation streaming; cancel is a no-op.
  },
};
