import type { ProcessingStep } from "@/components/ui/EnhancedProcessingSteps";
import type { StandardESReviewModel } from "@/lib/ai/es-review-models";
import type { PublicReviewMeta } from "@/shared/contracts/es-review-sse";

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
  review_meta?: PublicReviewMeta;
  billing_outcome?: {
    success?: boolean;
    billable?: boolean;
    schema_version?: number;
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
  code?: string;
  action?: string;
  retryable?: boolean;
}

export interface SSERewriteDeltaEvent {
  type: "rewrite_delta";
  text: string;
}

export interface SSERewriteCompleteEvent {
  type: "rewrite_complete";
  value: string;
}

export interface SSEExplanationCompleteEvent {
  type: "explanation_complete";
  value: string;
}

export interface SSESourceAddedEvent {
  type: "source_added";
  source: TemplateSource;
}

export type SSEEvent =
  | SSEProgressEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSERewriteDeltaEvent
  | SSERewriteCompleteEvent
  | SSEExplanationCompleteEvent
  | SSESourceAddedEvent;

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
    sectionId?: string;
    sectionContent: string;
    sectionCharLimit?: number;
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
