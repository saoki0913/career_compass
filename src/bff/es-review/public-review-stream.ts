type PublicESReviewSource = {
  source_url: string;
  content_type: string;
  content_type_label?: string;
  title?: string;
  domain?: string;
  excerpt?: string;
};

type PublicReviewMeta = {
  llm_provider?: string;
  llm_model?: string | null;
  llm_model_alias?: string | null;
  review_variant?: string;
  grounding_mode?: string;
  primary_role?: string;
  reference_es_count?: number;
  evidence_coverage_level?: string;
  weak_evidence_notice?: boolean;
  rewrite_validation_status?: string;
  rewrite_validation_user_hint?: string | null;
  final_acceptance_source?: string;
  ai_smell_tier?: number;
  concrete_marker_count?: number;
  opening_conclusion_chars?: number;
  rewrite_sentence_count?: number;
};

const PROGRESS_COPY: Record<string, { label: string; subLabel?: string }> = {
  rag_fetch: { label: "企業情報を確認しています" },
  analysis: { label: "設問を整理しています" },
  rewrite: { label: "改善した回答を提案しています" },
  sources: { label: "出典リンクを整理しています" },
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function sanitizeProgress(event: Record<string, unknown>): Record<string, unknown> {
  const step = stringValue(event.step) ?? "analysis";
  const progress = numberValue(event.progress) ?? 0;
  const copy = PROGRESS_COPY[step] ?? PROGRESS_COPY.analysis;
  return {
    type: "progress",
    step,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    label: copy.label,
    ...(copy.subLabel ? { subLabel: copy.subLabel } : {}),
  };
}

function sanitizeSource(value: unknown): PublicESReviewSource | null {
  const source = objectValue(value);
  if (!source) return null;

  const sourceUrl = stringValue(source.source_url);
  const contentType = stringValue(source.content_type);
  if (!sourceUrl || !contentType) return null;

  return {
    source_url: sourceUrl,
    content_type: contentType,
    ...(stringValue(source.content_type_label) ? { content_type_label: stringValue(source.content_type_label) } : {}),
    ...(stringValue(source.title) ? { title: stringValue(source.title) } : {}),
    ...(stringValue(source.domain) ? { domain: stringValue(source.domain) } : {}),
    ...(stringValue(source.excerpt) ? { excerpt: stringValue(source.excerpt) } : {}),
  };
}

function sanitizeSources(value: unknown): PublicESReviewSource[] {
  return Array.isArray(value)
    ? value.map(sanitizeSource).filter((source): source is PublicESReviewSource => source !== null)
    : [];
}

function sanitizeReviewMeta(value: unknown): PublicReviewMeta | undefined {
  const meta = objectValue(value);
  if (!meta) return undefined;

  return {
    ...(stringValue(meta.llm_provider) ? { llm_provider: stringValue(meta.llm_provider) } : {}),
    ...(typeof meta.llm_model === "string" || meta.llm_model === null ? { llm_model: meta.llm_model } : {}),
    ...(typeof meta.llm_model_alias === "string" || meta.llm_model_alias === null ? { llm_model_alias: meta.llm_model_alias } : {}),
    ...(stringValue(meta.review_variant) ? { review_variant: stringValue(meta.review_variant) } : {}),
    ...(stringValue(meta.grounding_mode) ? { grounding_mode: stringValue(meta.grounding_mode) } : {}),
    ...(stringValue(meta.primary_role) ? { primary_role: stringValue(meta.primary_role) } : {}),
    ...(numberValue(meta.reference_es_count) !== undefined ? { reference_es_count: numberValue(meta.reference_es_count) } : {}),
    ...(stringValue(meta.evidence_coverage_level) ? { evidence_coverage_level: stringValue(meta.evidence_coverage_level) } : {}),
    ...(booleanValue(meta.weak_evidence_notice) !== undefined ? { weak_evidence_notice: booleanValue(meta.weak_evidence_notice) } : {}),
    ...(stringValue(meta.rewrite_validation_status) ? { rewrite_validation_status: stringValue(meta.rewrite_validation_status) } : {}),
    ...(typeof meta.rewrite_validation_user_hint === "string" || meta.rewrite_validation_user_hint === null
      ? { rewrite_validation_user_hint: meta.rewrite_validation_user_hint }
      : {}),
    ...(stringValue(meta.final_acceptance_source) ? { final_acceptance_source: stringValue(meta.final_acceptance_source) } : {}),
    ...(numberValue(meta.ai_smell_tier) !== undefined ? { ai_smell_tier: numberValue(meta.ai_smell_tier) } : {}),
    ...(numberValue(meta.concrete_marker_count) !== undefined ? { concrete_marker_count: numberValue(meta.concrete_marker_count) } : {}),
    ...(numberValue(meta.opening_conclusion_chars) !== undefined ? { opening_conclusion_chars: numberValue(meta.opening_conclusion_chars) } : {}),
    ...(numberValue(meta.rewrite_sentence_count) !== undefined ? { rewrite_sentence_count: numberValue(meta.rewrite_sentence_count) } : {}),
  };
}

function sanitizeTemplateReview(value: unknown): Record<string, unknown> | undefined {
  const review = objectValue(value);
  if (!review) return undefined;

  const templateType = stringValue(review.template_type);
  if (!templateType) return undefined;

  return {
    template_type: templateType,
    variants: [],
    keyword_sources: sanitizeSources(review.keyword_sources),
  };
}

function sanitizeBillingOutcome(value: unknown): Record<string, unknown> | undefined {
  const outcome = objectValue(value);
  if (!outcome) return undefined;
  return {
    ...(booleanValue(outcome.success) !== undefined ? { success: booleanValue(outcome.success) } : {}),
    ...(booleanValue(outcome.billable) !== undefined ? { billable: booleanValue(outcome.billable) } : {}),
    ...(numberValue(outcome.schema_version) !== undefined ? { schema_version: numberValue(outcome.schema_version) } : {}),
  };
}

function getCompleteResult(event: Record<string, unknown>): Record<string, unknown> | null {
  const direct = objectValue(event.result);
  if (direct) return direct;

  const data = objectValue(event.data);
  const nested = data ? objectValue(data.result) : null;
  return nested;
}

export function sanitizePublicESReviewCompleteEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const result = getCompleteResult(event) ?? {};
  const rewrites = Array.isArray(result.rewrites)
    ? result.rewrites.filter((rewrite): rewrite is string => typeof rewrite === "string")
    : [];
  const templateReview = sanitizeTemplateReview(result.template_review);
  const reviewMeta = sanitizeReviewMeta(result.review_meta);
  const improvementExplanation = stringValue(result.improvement_explanation);
  const billingOutcome = sanitizeBillingOutcome(result.billing_outcome ?? event.billing_outcome);

  return {
    type: "complete",
    result: {
      rewrites,
      ...(templateReview ? { template_review: templateReview } : {}),
      ...(improvementExplanation ? { improvement_explanation: improvementExplanation } : {}),
      ...(reviewMeta ? { review_meta: reviewMeta } : {}),
      ...(billingOutcome ? { billing_outcome: billingOutcome } : {}),
    },
    ...(numberValue(event.creditCost) !== undefined ? { creditCost: numberValue(event.creditCost) } : {}),
  };
}

export function sanitizePublicESReviewProgressEvent(
  event: Record<string, unknown>,
): { suppress: true; emitExtra?: Record<string, unknown>[] } {
  const eventType = event.type;

  if (eventType === "progress") {
    return { suppress: true, emitExtra: [sanitizeProgress(event)] };
  }

  if (eventType === "chunk" && typeof event.text === "string") {
    return { suppress: true, emitExtra: [{ type: "rewrite_delta", text: event.text }] };
  }

  if (eventType === "string_chunk") {
    if (event.path === "streaming_rewrite" && typeof event.text === "string") {
      return { suppress: true, emitExtra: [{ type: "rewrite_delta", text: event.text }] };
    }
    return { suppress: true };
  }

  if (eventType === "field_complete") {
    if (event.path === "streaming_rewrite" && typeof event.value === "string") {
      return { suppress: true, emitExtra: [{ type: "rewrite_complete", value: event.value }] };
    }
    if (event.path === "improvement_explanation" && typeof event.value === "string") {
      return { suppress: true, emitExtra: [{ type: "explanation_complete", value: event.value }] };
    }
    return { suppress: true };
  }

  if (eventType === "array_item_complete") {
    if (typeof event.path === "string" && event.path.startsWith("keyword_sources.")) {
      const source = sanitizeSource(event.value);
      return source
        ? { suppress: true, emitExtra: [{ type: "source_added", source }] }
        : { suppress: true };
    }
    return { suppress: true };
  }

  return { suppress: true };
}

export function sanitizePublicESReviewErrorEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "error",
    message: typeof event.message === "string" ? event.message : "添削処理を完了できませんでした。",
    code: typeof event.code === "string" ? event.code : "ES_REVIEW_STREAM_FAILED",
    action: typeof event.action === "string" ? event.action : "時間を置いて、もう一度お試しください。",
    retryable: typeof event.retryable === "boolean" ? event.retryable : true,
  };
}
