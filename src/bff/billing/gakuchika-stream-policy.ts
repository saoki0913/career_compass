import { CONVERSATION_CREDITS_PER_TURN, consumeCredits, hasEnoughCredits } from "@/lib/credits";
import type { BillingOutcome, BillingPolicy, BillingPrecheckResult } from "./types";

export interface GakuchikaStreamBillingContext {
  userId: string;
  gakuchikaId: string;
  newQuestionCount: number;
}

export const gakuchikaStreamPolicy: BillingPolicy<GakuchikaStreamBillingContext> = {
  async precheck(ctx): Promise<BillingPrecheckResult> {
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

  async confirm(ctx, outcome: BillingOutcome): Promise<void> {
    if (outcome.kind !== "billable_success") {
      return;
    }
    if (outcome.creditsConsumed <= 0) {
      return;
    }
    await consumeCredits(ctx.userId, outcome.creditsConsumed, "gakuchika", ctx.gakuchikaId);
  },

  async cancel(): Promise<void> {
    // No reservation exists for gakuchika streaming; cancel is a no-op.
  },
};
