import { describe, expect, it } from "vitest";
import {
  getStandardESReviewModelHelper,
  getStandardESReviewModelLabel,
  isLowCostESReviewModel,
} from "@/lib/ai/es-review-models";

describe("es-review-models", () => {
  it("returns the low-cost helper only for the low-cost option", () => {
    expect(getStandardESReviewModelHelper("low-cost")).toBe("品質はやや下がる可能性があります。");
    expect(getStandardESReviewModelHelper("claude-sonnet")).toBeNull();
  });

  it("keeps labels and guards stable", () => {
    expect(getStandardESReviewModelLabel("gpt")).toBe("GPT");
    expect(getStandardESReviewModelLabel("claude-sonnet")).toBe("Claude");
    expect(getStandardESReviewModelLabel("gemini")).toBe("Gemini");
    expect(getStandardESReviewModelLabel("low-cost")).toBe("クレジット消費を抑えて添削");
    expect(isLowCostESReviewModel("low-cost")).toBe(true);
    expect(isLowCostESReviewModel("gpt")).toBe(false);
  });
});
