import { describe, expect, it } from "vitest";
import {
  LOW_COST_REVIEW_META,
  isLegacyQwenReviewMeta,
  normalizeQwenReviewMessageContent,
} from "./qwen-review-meta-normalization.mjs";

describe("qwen review meta normalization", () => {
  it("detects legacy qwen metadata", () => {
    expect(
      isLegacyQwenReviewMeta({
        llm_provider: "qwen-es-review",
        llm_model: "org/qwen3-es-review-lora",
        review_variant: "qwen3-beta",
      }),
    ).toBe(true);
  });

  it("normalizes legacy qwen review payloads to low-cost metadata", () => {
    const content = JSON.stringify({
      type: "es_review_v1",
      review_meta: {
        llm_provider: "qwen-es-review",
        llm_model: "org/qwen3-es-review-lora",
        llm_model_alias: "qwen-beta",
        review_variant: "qwen3-beta",
        grounding_mode: "company_general",
      },
    });

    const result = normalizeQwenReviewMessageContent(content);
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.parsed.review_meta).toMatchObject({
      ...LOW_COST_REVIEW_META,
      grounding_mode: "company_general",
    });
  });

  it("leaves non-target payloads unchanged", () => {
    const content = JSON.stringify({
      type: "es_review_v1",
      review_meta: {
        llm_provider: "openai",
        llm_model: "gpt-5.4-mini",
        llm_model_alias: "low-cost",
        review_variant: "standard",
      },
    });

    const result = normalizeQwenReviewMessageContent(content);
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(false);
    expect(result.reason).toBe("not_qwen");
  });

  it("reports invalid json without throwing", () => {
    const result = normalizeQwenReviewMessageContent("{bad json");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_json");
  });
});
