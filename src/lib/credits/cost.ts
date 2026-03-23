export type ESReviewPricingModel = "claude-sonnet" | "gpt" | "gemini" | "low-cost";
export type ESReviewCharBand = "up_to_500" | "up_to_1000" | "up_to_1500" | "over_1500";

export const ES_REVIEW_CHAR_BANDS: ReadonlyArray<{
  key: ESReviewCharBand;
  maxChars: number;
}> = [
  { key: "up_to_500", maxChars: 500 },
  { key: "up_to_1000", maxChars: 1000 },
  { key: "up_to_1500", maxChars: 1500 },
  { key: "over_1500", maxChars: Number.POSITIVE_INFINITY },
] as const;

const PREMIUM_ES_REVIEW_CREDITS: Readonly<Record<ESReviewCharBand, number>> = {
  up_to_500: 6,
  up_to_1000: 10,
  up_to_1500: 14,
  over_1500: 20,
} as const;

export const ES_REVIEW_CREDIT_COST_TABLE: Readonly<Record<ESReviewPricingModel, Record<ESReviewCharBand, number>>> = {
  "claude-sonnet": PREMIUM_ES_REVIEW_CREDITS,
  gpt: PREMIUM_ES_REVIEW_CREDITS,
  gemini: PREMIUM_ES_REVIEW_CREDITS,
  "low-cost": {
    up_to_500: 3,
    up_to_1000: 6,
    up_to_1500: 9,
    over_1500: 12,
  },
} as const;

export function resolveESReviewPricingModel(model: string | null | undefined): ESReviewPricingModel {
  const normalized = (model || "").trim().toLowerCase();

  if (!normalized) {
    return "claude-sonnet";
  }
  if (normalized === "low-cost" || normalized === "gpt-fast" || normalized.startsWith("gpt-5.4-mini")) {
    return "low-cost";
  }
  if (normalized === "gpt" || normalized.startsWith("gpt-5.4") || normalized.startsWith("gpt-5")) {
    return "gpt";
  }
  if (normalized === "gemini" || normalized.startsWith("gemini")) {
    return "gemini";
  }
  if (normalized === "claude-sonnet" || normalized.startsWith("claude-sonnet")) {
    return "claude-sonnet";
  }

  return "claude-sonnet";
}

export function resolveESReviewCharBand(charCount: number): ESReviewCharBand {
  if (charCount <= 500) return "up_to_500";
  if (charCount <= 1000) return "up_to_1000";
  if (charCount <= 1500) return "up_to_1500";
  return "over_1500";
}

export type ESReviewBillingPlan = "free" | "standard" | "pro";

/**
 * Free プランは実体モデルを GPT-5.4 mini（low-cost 経路）に固定しつつ、
 * 請求クレジットは Claude / GPT / Gemini（プレミアム帯）と同じ表を使う。
 */
export function calculateESReviewCost(
  charCount: number,
  llmModel?: string | null,
  options?: { userPlan?: ESReviewBillingPlan },
): number {
  const band = resolveESReviewCharBand(Math.max(0, charCount));
  if (options?.userPlan === "free") {
    return PREMIUM_ES_REVIEW_CREDITS[band];
  }
  const pricingModel = resolveESReviewPricingModel(llmModel);
  return ES_REVIEW_CREDIT_COST_TABLE[pricingModel][band];
}
