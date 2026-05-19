import { describe, expect, it } from "vitest";
import { sanitizePublicESReviewCompleteEvent } from "./public-review-stream";

describe("public ES review stream sanitizer", () => {
  it("drops invalid enum-like metadata and template values", () => {
    const event = sanitizePublicESReviewCompleteEvent({
      type: "complete",
      result: {
        rewrites: ["改善後の本文"],
        template_review: {
          template_type: "future_template",
          keyword_sources: [],
        },
        review_meta: {
          grounding_mode: "assistive",
          evidence_coverage_level: "future",
          rewrite_validation_status: "failed",
          final_acceptance_source: "manual",
        },
      },
    });

    expect(event).toEqual({
      type: "complete",
      result: {
        rewrites: ["改善後の本文"],
        review_meta: {},
      },
    });
  });
});
