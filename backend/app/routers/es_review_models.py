"""Typed models for ES review router."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field


class TemplateRequest(BaseModel):
    """Request for template-based ES review."""

    template_type: str
    company_name: Optional[str] = None
    industry: Optional[str] = None
    question: str
    answer: str
    char_min: Optional[int] = None
    char_max: Optional[int] = None
    intern_name: Optional[str] = None
    role_name: Optional[str] = None
    inferred_template_type: Optional[str] = None
    inferred_confidence: Optional[str] = None
    secondary_template_types: list[str] = Field(default_factory=list)
    classification_rationale: Optional[str] = None
    recommended_grounding_level: Optional[str] = None


class TemplateVariant(BaseModel):
    text: str
    char_count: int
    pros: list[str]
    cons: list[str]
    keywords_used: list[str]
    keyword_sources: list[str]


class TemplateSource(BaseModel):
    source_id: str
    source_url: str
    content_type: str
    content_type_label: Optional[str] = None
    title: Optional[str] = None
    domain: Optional[str] = None
    excerpt: Optional[str] = None


class RoleContext(BaseModel):
    primary_role: Optional[str] = None
    role_candidates: list[str] = []
    source: str = "none"


class ProfileContext(BaseModel):
    university: Optional[str] = None
    faculty: Optional[str] = None
    graduation_year: Optional[int] = None
    target_industries: list[str] = Field(default_factory=list)
    target_job_types: list[str] = Field(default_factory=list)


class GakuchikaContextItem(BaseModel):
    title: str
    source_status: str = "structured_summary"
    strengths: list[dict[str, Any] | str] = Field(default_factory=list)
    action_text: Optional[str] = None
    result_text: Optional[str] = None
    numbers: list[str] = Field(default_factory=list)
    content_excerpt: Optional[str] = None
    fact_spans: list[str] = Field(default_factory=list)


class DocumentSectionContext(BaseModel):
    title: str
    content: str


class DocumentContext(BaseModel):
    other_sections: list[DocumentSectionContext] = Field(default_factory=list)


class ReviewTokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cached_input_tokens: int = 0
    llm_call_count: int = 0
    structured_call_count: int = 0
    text_call_count: int = 0


class ReviewMeta(BaseModel):
    llm_provider: str = "claude"
    llm_model: Optional[str] = None
    llm_model_alias: Optional[str] = None
    review_variant: str = "standard"
    grounding_mode: str = "none"
    primary_role: Optional[str] = None
    role_source: Optional[str] = None
    triggered_enrichment: bool = False
    enrichment_completed: bool = False
    enrichment_sources_added: int = 0
    reference_es_count: int = 0
    reference_es_mode: str = "quality_profile_only"
    reference_quality_profile_used: bool = False
    reference_outline_used: bool = False
    reference_hint_count: int = 0
    reference_conditional_hints_applied: bool = False
    reference_profile_variance: Optional[str] = None
    company_grounding_policy: str = "assistive"
    effective_company_grounding_policy: str = "assistive"
    recommended_grounding_level: str = "none"
    effective_grounding_level: str = "none"
    company_evidence_count: int = 0
    company_evidence_verified_count: int = 0
    company_evidence_rejected_count: int = 0
    company_grounding_safety_applied: bool = False
    evidence_coverage_level: str = "none"
    weak_evidence_notice: bool = False
    selected_company_evidence_themes: list[str] = Field(default_factory=list)
    injection_risk: Optional[str] = None
    user_context_sources: list[str] = Field(default_factory=list)
    hallucination_guard_mode: str = "strict"
    rewrite_generation_mode: str = "normal"
    classification_confidence: str = "low"
    classification_secondary_candidates: list[str] = Field(default_factory=list)
    classification_rationale: Optional[str] = None
    misclassification_recovery_applied: bool = False
    rewrite_attempt_count: int = 0
    length_policy: str = "strict"
    length_shortfall: int = 0
    length_shortfall_bucket: Optional[str] = None
    soft_min_floor_ratio: float | None = None
    length_fix_attempted: bool = False
    length_fix_result: str = "not_needed"
    rewrite_validation_status: str = "strict_ok"
    rewrite_validation_codes: list[str] = Field(default_factory=list)
    rewrite_validation_user_hint: Optional[str] = None
    fallback_triggered: bool = False
    fallback_reason: Optional[str] = None
    grounding_repair_applied: bool = False
    length_profile_id: Optional[str] = None
    target_window_lower: Optional[int] = None
    target_window_upper: Optional[int] = None
    source_fill_ratio: Optional[float] = None
    required_growth: int = 0
    latest_failed_length: int = 0
    length_failure_code: Optional[str] = None
    unfinished_tail_detected: bool = False
    retrieval_profile_name: Optional[str] = None
    priority_source_match_count: int = 0
    ai_smell_tier: int = 0
    hallucination_tier: int = 0
    concrete_marker_count: int = 0
    opening_conclusion_chars: int = 0
    rewrite_sentence_count: int = 0
    token_usage: Optional[ReviewTokenUsage] = Field(default=None, exclude=True)
    rewrite_rejection_reasons: list[str] = Field(default_factory=list, exclude=True)
    rewrite_attempt_trace: list[dict[str, Any]] = Field(default_factory=list, exclude=True)
    rewrite_total_rewrite_attempts: int = Field(default=0, exclude=True)
    ai_smell_warnings: list[dict[str, str]] = Field(default_factory=list, exclude=True)


class TemplateReview(BaseModel):
    template_type: str
    variants: list[TemplateVariant]
    keyword_sources: list[TemplateSource]


class ReviewRequest(BaseModel):
    content: str
    section_id: Optional[str] = None
    document_id: Optional[str] = None
    has_company_rag: bool = False
    company_id: Optional[str] = None
    section_title: Optional[str] = None
    section_char_limit: Optional[int] = None
    template_request: Optional[TemplateRequest] = None
    role_context: Optional[RoleContext] = None
    retrieval_query: Optional[str] = None
    profile_context: Optional[ProfileContext] = None
    gakuchika_context: list[GakuchikaContextItem] = Field(default_factory=list)
    document_context: Optional[DocumentContext] = None
    llm_model: Optional[str] = None
    user_provided_corporate_urls: list[str] = Field(default_factory=list)


class Issue(BaseModel):
    category: str
    issue: str
    suggestion: str
    issue_id: Optional[str] = None
    required_action: Optional[str] = None
    must_appear: Optional[str] = None
    priority_rank: Optional[int] = None
    why_now: Optional[str] = None
    difficulty: Optional[str] = None


class ReviewResponse(BaseModel):
    rewrites: list[str]
    template_review: Optional[TemplateReview] = None
    review_meta: Optional[ReviewMeta] = None


class CompanyReviewStatusResponse(BaseModel):
    status: str
    ready_for_es_review: bool
    reason: str
    total_chunks: int
    strategic_chunks: int
    last_updated: Optional[str] = None


# ---------------------------------------------------------------------------
# Internal transfer objects (dataclass, NOT Pydantic)
# ---------------------------------------------------------------------------

@dataclass
class ReviewContext:
    """Computed context for a single ES review pass."""

    template_type: str
    template_request: Any  # TemplateRequest
    request: Any  # ReviewRequest
    text_caller: Any
    review_feature: str
    llm_provider: str
    llm_model: str | None
    review_variant: str
    injection_risk: str | None
    progress_queue: Any

    # Classification
    classification_confidence: str = "low"
    classification_secondary_candidates: list[str] = field(default_factory=list)
    classification_rationale: str | None = None
    classification_hints: list[str] = field(default_factory=list)
    misclassification_recovery_applied: bool = False
    recommended_grounding_level: str = "none"

    # Grounding & Evidence
    company_grounding: str = "assistive"
    effective_role_name: str | None = None
    effective_grounding_mode: str = "none"
    effective_grounding_level: str = "none"
    effective_company_grounding: str = "assistive"
    effective_company_rag_available: bool = False
    grounding_repair_applied: bool = False
    has_mismatched_company_sources: bool = False

    # Char limits
    char_min: int | None = None
    char_max: int | None = None

    # Prompt context
    prompt_user_facts: list[dict] = field(default_factory=list)
    prompt_company_evidence_cards: list[dict] = field(default_factory=list)
    verified_rag_sources: list[dict] = field(default_factory=list)
    rejected_rag_sources: list[dict] = field(default_factory=list)
    evidence_coverage_level: str = "none"
    weak_evidence_notice: bool = False

    # Reference
    reference_examples: list[dict] = field(default_factory=list)
    reference_quality_profile: dict | None = None
    reference_quality_block: str = ""
    reference_outline_used: bool = False

    # Misc
    generic_role_mode: bool = False
    user_priority_urls: set[str] = field(default_factory=set)
    use_tight_length_control: bool = False
    review_token_usage: Any = None  # ReviewTokenUsage

    # Enrichment passthrough
    triggered_enrichment: bool = False
    enrichment_completed: bool = False
    enrichment_sources_added: int = 0

    # Retrieval
    retrieval_profile_name: str | None = None
    priority_source_match_count: int = 0


@dataclass
class RewriteLoopResult:
    """Result of the main rewrite attempt loop."""

    final_rewrite: str = ""
    best_rejected_candidate: str = ""
    best_rejected_length: int = 0
    best_rejected_distance: int | None = None
    best_retry_code: str = "generic"
    best_failure_codes: list[str] = field(default_factory=list)
    best_rejected_ai_smell_warnings: list[dict] = field(default_factory=list)
    best_rejected_hallucination_warnings: list[dict] = field(default_factory=list)
    accepted_attempt: int = 0
    accepted_length_policy: str = "strict"
    accepted_length_shortfall: int = 0
    accepted_soft_min_floor_ratio: float | None = None
    accepted_length_profile_id: str | None = None
    accepted_target_window_lower: int | None = None
    accepted_target_window_upper: int | None = None
    accepted_source_fill_ratio: float | None = None
    accepted_required_growth: int = 0
    accepted_latest_failed_length: int = 0
    accepted_length_failure_code: str | None = None
    accepted_ai_smell_warnings: list[dict] = field(default_factory=list)
    accepted_hallucination_warnings: list[dict] = field(default_factory=list)
    rewrite_generation_mode: str = "normal"
    rewrite_validation_status: str = "strict_ok"
    rewrite_validation_codes: list[str] = field(default_factory=list)
    rewrite_validation_user_hint: str | None = None
    attempt_failures: list[str] = field(default_factory=list)
    rewrite_attempt_trace: list[dict] = field(default_factory=list)
    executed_rewrite_attempts: int = 0
    retry_code: str = "generic"
    retry_failure_codes: list[str] = field(default_factory=list)


@dataclass
class RecoveryResult:
    """Result after fallback/length-fix/best-effort recovery."""

    final_rewrite: str = ""
    fallback_triggered: bool = False
    fallback_reason: str | None = None
    length_fix_attempted: bool = False
    length_fix_result: str = "not_needed"
    rewrite_generation_mode: str = "normal"
    rewrite_validation_status: str = "strict_ok"
    rewrite_validation_codes: list[str] = field(default_factory=list)
    rewrite_validation_user_hint: str | None = None
    accepted_attempt: int = 0
    accepted_length_policy: str = "strict"
    accepted_length_shortfall: int = 0
    accepted_soft_min_floor_ratio: float | None = None
    accepted_length_profile_id: str | None = None
    accepted_target_window_lower: int | None = None
    accepted_target_window_upper: int | None = None
    accepted_source_fill_ratio: float | None = None
    accepted_required_growth: int = 0
    accepted_latest_failed_length: int = 0
    accepted_length_failure_code: str | None = None
    accepted_ai_smell_warnings: list[dict] = field(default_factory=list)
    accepted_hallucination_warnings: list[dict] = field(default_factory=list)
    attempt_failures: list[str] = field(default_factory=list)
    rewrite_attempt_trace: list[dict] = field(default_factory=list)
