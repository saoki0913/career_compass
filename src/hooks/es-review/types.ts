import type { ProcessingStep } from "@/components/ui/EnhancedProcessingSteps";
import type { StandardESReviewModel } from "@/lib/ai/es-review-models";

export interface SectionData {
  title: string;
  content: string;
  charLimit?: number;
}

export type ReviewMode = "standard";

export type TemplateType =
  | "basic"
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "self_pr"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

export interface TemplateVariant {
  text: string;
  char_count: number;
  pros: string[];
  cons: string[];
  keywords_used: string[];
  keyword_sources: string[];
}

export interface TemplateSource {
  source_id: string;
  source_url: string;
  content_type: string;
  content_type_label?: string;
  title?: string;
  domain?: string;
  excerpt?: string;
}

export interface TemplateReview {
  template_type: TemplateType;
  variants: TemplateVariant[];
  keyword_sources: TemplateSource[];
}

export interface ReviewResult {
  rewrites: string[];
  template_review?: TemplateReview;
  improvement_explanation?: string;
  review_meta?: {
    llm_provider?: string;
    llm_model?: string | null;
    llm_model_alias?: string | null;
    review_variant?: string;
    grounding_mode?: "role_grounded" | "company_general" | "none";
    primary_role?: string;
    role_source?: string;
    triggered_enrichment?: boolean;
    enrichment_completed?: boolean;
    enrichment_sources_added?: number;
    reference_es_count?: number;
    reference_es_mode?: string;
    reference_quality_profile_used?: boolean;
    reference_outline_used?: boolean;
    reference_hint_count?: number;
    reference_conditional_hints_applied?: boolean;
    reference_profile_variance?: "low" | "medium" | "high" | null;
    company_grounding_policy?: "required" | "assistive";
    effective_company_grounding_policy?: "required" | "assistive";
    recommended_grounding_level?: "none" | "light" | "standard" | "deep";
    effective_grounding_level?: "none" | "light" | "standard" | "deep";
    company_evidence_count?: number;
    evidence_coverage_level?: "none" | "weak" | "partial" | "strong";
    weak_evidence_notice?: boolean;
    injection_risk?: string | null;
    user_context_sources?: string[];
    hallucination_guard_mode?: "strict";
    classification_confidence?: "high" | "medium" | "low";
    classification_secondary_candidates?: TemplateType[];
    classification_rationale?: string | null;
    misclassification_recovery_applied?: boolean;
    rewrite_attempt_count?: number;
    length_policy?: "strict" | "soft_ok";
    length_shortfall?: number;
    soft_min_floor_ratio?: number | null;
    length_fix_attempted?: boolean;
    length_fix_result?: "not_needed" | "strict_recovered" | "soft_recovered" | "failed";
    rewrite_validation_status?: "strict_ok" | "soft_ok" | "degraded";
    rewrite_validation_codes?: string[];
    rewrite_validation_user_hint?: string | null;
    fallback_triggered?: boolean;
    fallback_reason?: string | null;
    grounding_repair_applied?: boolean;
    ai_smell_tier?: number;
    concrete_marker_count?: number;
    opening_conclusion_chars?: number;
    rewrite_sentence_count?: number;
  };
}

export interface UseESReviewOptions {
  documentId: string;
  /** Free のとき ES 添削の見積クレジットをプレミアム帯に合わせる（サーバと一致させる） */
  esReviewBillingPlan?: "free" | "standard" | "pro";
}

export interface CurrentSectionInfo {
  title: string;
  charLimit?: number;
}

export interface SSEProgressState {
  currentStep: string | null;
  progress: number;
  steps: ProcessingStep[];
  isStreaming: boolean;
}

export interface SSEProgressEvent {
  type: "progress";
  step: string;
  progress: number;
  label?: string;
  subLabel?: string;
}

export interface SSECompleteEvent {
  type: "complete";
  result: ReviewResult;
  creditCost?: number;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
  error_type?: string;
}

export interface SSEFieldCompleteEvent {
  type: "field_complete";
  path: string;
  value: unknown;
}

export interface SSEArrayItemCompleteEvent {
  type: "array_item_complete";
  path: string;
  value: unknown;
}

export interface SSEChunkEvent {
  type: "chunk";
  text: string;
}

export interface SSEStringChunkEvent {
  type: "string_chunk";
  path: string;
  text: string;
}

export type SSEEvent =
  | SSEProgressEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEFieldCompleteEvent
  | SSEArrayItemCompleteEvent
  | SSEChunkEvent
  | SSEStringChunkEvent;

export interface VisibleTemplateSource extends TemplateSource {
  isSettled: boolean;
}

export type ReviewPlaybackPhase = "idle" | "rewrite" | "sources" | "complete";

export interface UseESReviewReturn {
  review: ReviewResult | null;
  visibleRewriteText: string;
  explanationText: string;
  explanationComplete: boolean;
  visibleSources: VisibleTemplateSource[];
  finalRewriteText: string;
  playbackPhase: ReviewPlaybackPhase;
  isPlaybackComplete: boolean;
  isLoading: boolean;
  error: string | null;
  /** スナックバー用。`error` と同時に設定されることがある */
  errorAction: string | null;
  creditCost: number | null;
  currentSection: CurrentSectionInfo | null;
  cancelReview: () => void;
  isCancelling: boolean;
  elapsedTime: number;
  sseProgress: SSEProgressState;
  requestSectionReview: (params: {
    sectionTitle: string;
    sectionContent: string;
    sectionCharLimit?: number;
    hasCompanyRag?: boolean;
    companyId?: string;
    templateType?: TemplateType;
    internName?: string;
    roleName?: string;
    industryOverride?: string;
    roleSelectionSource?: string;
    reviewMode?: ReviewMode;
    llmModel?: StandardESReviewModel;
  }) => Promise<boolean>;
  clearReview: () => void;
}
