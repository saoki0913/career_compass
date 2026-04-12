import { describe, expect, it } from "vitest";

import {
  ES_REVIEW_CREDIT_COST_TABLE,
  calculateESReviewCost,
  resolveESReviewCharBand,
  resolveESReviewPricingModel,
} from "@/lib/credits/cost";

describe("credits/cost", () => {
  it("resolves pricing models from aliases and explicit model ids", () => {
    expect(resolveESReviewPricingModel("claude-sonnet")).toBe("claude-sonnet");
    expect(resolveESReviewPricingModel("gpt")).toBe("gpt");
    expect(resolveESReviewPricingModel("gpt-5.4")).toBe("gpt");
    expect(resolveESReviewPricingModel("gpt-5.4-mini")).toBe("low-cost");
    expect(resolveESReviewPricingModel("low-cost")).toBe("low-cost");
    expect(resolveESReviewPricingModel("claude-haiku")).toBe("low-cost");
    expect(resolveESReviewPricingModel("claude-haiku-4-5-20251001")).toBe("low-cost");
    expect(resolveESReviewPricingModel("gemini-3.1-pro-preview")).toBe("gemini");
  });

  it("uses the new four-band thresholds", () => {
    expect(resolveESReviewCharBand(500)).toBe("up_to_500");
    expect(resolveESReviewCharBand(501)).toBe("up_to_1000");
    expect(resolveESReviewCharBand(1000)).toBe("up_to_1000");
    expect(resolveESReviewCharBand(1001)).toBe("up_to_1500");
    expect(resolveESReviewCharBand(1501)).toBe("over_1500");
  });

  it("returns provider-aware credit costs", () => {
    expect(calculateESReviewCost(420, "claude-sonnet")).toBe(
      ES_REVIEW_CREDIT_COST_TABLE["claude-sonnet"].up_to_500,
    );
    expect(calculateESReviewCost(920, "gpt")).toBe(ES_REVIEW_CREDIT_COST_TABLE.gpt.up_to_1000);
    expect(calculateESReviewCost(1320, "gemini")).toBe(
      ES_REVIEW_CREDIT_COST_TABLE.gemini.up_to_1500,
    );
    expect(calculateESReviewCost(1680, "low-cost")).toBe(
      ES_REVIEW_CREDIT_COST_TABLE["low-cost"].over_1500,
    );
    expect(calculateESReviewCost(420, "low-cost", { userPlan: "free" })).toBe(
      ES_REVIEW_CREDIT_COST_TABLE["claude-sonnet"].up_to_500,
    );
    expect(calculateESReviewCost(920, "low-cost", { userPlan: "free" })).toBe(
      ES_REVIEW_CREDIT_COST_TABLE["claude-sonnet"].up_to_1000,
    );
    expect(calculateESReviewCost(920, "gpt", { userPlan: "free" })).toBe(
      ES_REVIEW_CREDIT_COST_TABLE["claude-sonnet"].up_to_1000,
    );
  });
});
