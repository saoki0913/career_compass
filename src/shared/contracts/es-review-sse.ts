export const PUBLIC_SSE_EVENT_TYPES = [
  "progress",
  "complete",
  "error",
  "rewrite_delta",
  "rewrite_complete",
  "explanation_complete",
  "source_added",
] as const;

export type PublicSSEEventType = (typeof PUBLIC_SSE_EVENT_TYPES)[number];

export const VALIDATION_FAILURE_CODES = [
  "ok",
  "soft_ok",
  "empty",
  "fragment",
  "under_min",
  "over_max",
  "hallucination",
  "fact_preservation",
  "negative_self_eval",
  "company_reference_in_companyless",
  "bulletish_or_listlike",
  "style",
  "answer_focus",
  "verbose_opening",
  "structure",
  "grounding",
  "quantify",
  "llm_quality",
  "generic",
] as const;

export type ValidationFailureCode = (typeof VALIDATION_FAILURE_CODES)[number];

export const GROUNDING_MODES = ["none", "company_general", "role_grounded"] as const;
export type GroundingMode = (typeof GROUNDING_MODES)[number];

export const GROUNDING_LEVELS = ["none", "light", "standard", "deep"] as const;
export type GroundingLevel = (typeof GROUNDING_LEVELS)[number];

export const EVIDENCE_COVERAGE_LEVELS = [
  "not_applicable",
  "none",
  "weak",
  "partial",
  "strong",
] as const;
export type EvidenceCoverageLevel = (typeof EVIDENCE_COVERAGE_LEVELS)[number];

export const VALIDATION_STATUSES = ["strict_ok", "soft_ok", "degraded"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const FINAL_ACCEPTANCE_SOURCES = [
  "rewrite",
  "safe_rewrite",
  "degraded_best_effort",
] as const;
export type FinalAcceptanceSource = (typeof FINAL_ACCEPTANCE_SOURCES)[number];

export const HALLUCINATION_GUARD_MODES = ["advisory", "hard_block", "strict"] as const;
export type HallucinationGuardMode = (typeof HALLUCINATION_GUARD_MODES)[number];

export const CLASSIFICATION_CONFIDENCES = ["high", "medium", "low"] as const;
export type ClassificationConfidence = (typeof CLASSIFICATION_CONFIDENCES)[number];

export const COMPANY_GROUNDING_POLICIES = ["required", "assistive"] as const;
export type CompanyGroundingPolicy = (typeof COMPANY_GROUNDING_POLICIES)[number];

export const LENGTH_POLICIES = ["strict", "soft_ok"] as const;
export type LengthPolicy = (typeof LENGTH_POLICIES)[number];

export const REFERENCE_PROFILE_VARIANCES = ["low", "medium", "high"] as const;
export type ReferenceProfileVariance = (typeof REFERENCE_PROFILE_VARIANCES)[number];

export type PublicReviewMeta = {
  llm_provider?: string;
  llm_model?: string | null;
  llm_model_alias?: string | null;
  review_variant?: string;
  grounding_mode?: GroundingMode;
  primary_role?: string;
  reference_es_count?: number;
  evidence_coverage_level?: EvidenceCoverageLevel;
  weak_evidence_notice?: boolean;
  rewrite_validation_status?: ValidationStatus;
  rewrite_validation_user_hint?: string | null;
  final_acceptance_source?: FinalAcceptanceSource;
  ai_smell_tier?: number;
  concrete_marker_count?: number;
  opening_conclusion_chars?: number;
  rewrite_sentence_count?: number;
};
