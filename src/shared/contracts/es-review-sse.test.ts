import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_CONFIDENCES,
  COMPANY_GROUNDING_POLICIES,
  EVIDENCE_COVERAGE_LEVELS,
  FINAL_ACCEPTANCE_SOURCES,
  GROUNDING_LEVELS,
  GROUNDING_MODES,
  HALLUCINATION_GUARD_MODES,
  LENGTH_POLICIES,
  PUBLIC_SSE_EVENT_TYPES,
  REFERENCE_PROFILE_VARIANCES,
  VALIDATION_FAILURE_CODES,
  VALIDATION_STATUSES,
} from "./es-review-sse";
import type { PublicReviewMeta, PublicSSEEventType } from "./es-review-sse";

describe("ES review SSE contract", () => {
  it("exports the public SSE event literals", () => {
    const eventTypes: PublicSSEEventType[] = [...PUBLIC_SSE_EVENT_TYPES];

    expect(eventTypes).toEqual([
      "progress",
      "complete",
      "error",
      "rewrite_delta",
      "rewrite_complete",
      "explanation_complete",
      "source_added",
    ]);
  });

  it("exports enum literal sets used by backend ReviewMeta", () => {
    expect(VALIDATION_FAILURE_CODES).toContain("company_reference_in_companyless");
    expect(GROUNDING_MODES).toEqual(["none", "company_general", "role_grounded"]);
    expect(GROUNDING_LEVELS).toEqual(["none", "light", "standard", "deep"]);
    expect(EVIDENCE_COVERAGE_LEVELS).toContain("not_applicable");
    expect(VALIDATION_STATUSES).toEqual(["strict_ok", "soft_ok", "degraded"]);
    expect(FINAL_ACCEPTANCE_SOURCES).toEqual([
      "rewrite",
      "safe_rewrite",
      "degraded_best_effort",
    ]);
    expect(HALLUCINATION_GUARD_MODES).toEqual(["advisory", "hard_block", "strict"]);
    expect(CLASSIFICATION_CONFIDENCES).toEqual(["high", "medium", "low"]);
    expect(COMPANY_GROUNDING_POLICIES).toEqual(["required", "assistive"]);
    expect(LENGTH_POLICIES).toEqual(["strict", "soft_ok"]);
    expect(REFERENCE_PROFILE_VARIANCES).toEqual(["low", "medium", "high"]);
  });

  it("keeps PublicReviewMeta limited to the BFF public fields", () => {
    const meta = {
      llm_provider: "claude",
      llm_model: "claude-sonnet-4-5",
      llm_model_alias: null,
      review_variant: "standard",
      grounding_mode: "company_general",
      primary_role: "エンジニア",
      reference_es_count: 2,
      evidence_coverage_level: "partial",
      weak_evidence_notice: false,
      rewrite_validation_status: "strict_ok",
      rewrite_validation_user_hint: null,
      final_acceptance_source: "rewrite",
      ai_smell_tier: 0,
      concrete_marker_count: 3,
      opening_conclusion_chars: 24,
      rewrite_sentence_count: 4,
    } satisfies PublicReviewMeta;

    expect(Object.keys(meta).sort()).toEqual([
      "ai_smell_tier",
      "concrete_marker_count",
      "evidence_coverage_level",
      "final_acceptance_source",
      "grounding_mode",
      "llm_model",
      "llm_model_alias",
      "llm_provider",
      "opening_conclusion_chars",
      "primary_role",
      "reference_es_count",
      "review_variant",
      "rewrite_sentence_count",
      "rewrite_validation_status",
      "rewrite_validation_user_hint",
      "weak_evidence_notice",
    ]);
  });
});
