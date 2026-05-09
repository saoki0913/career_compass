import type { ReviewResult, SSEErrorEvent, SSEEvent, TemplateType } from "./types";

const TEMPLATE_TYPES = new Set<string>([
  "basic",
  "company_motivation",
  "intern_reason",
  "intern_goals",
  "gakuchika",
  "self_pr",
  "post_join_goals",
  "role_course_reason",
  "work_values",
]);

function isTemplateType(value: unknown): value is TemplateType {
  return typeof value === "string" && TEMPLATE_TYPES.has(value);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizeTemplateSources(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = objectValue(item);
    if (!source || typeof source.source_url !== "string" || typeof source.content_type !== "string") {
      return [];
    }
    return [{
      source_url: source.source_url,
      content_type: source.content_type,
      ...(typeof source.content_type_label === "string" ? { content_type_label: source.content_type_label } : {}),
      ...(typeof source.title === "string" ? { title: source.title } : {}),
      ...(typeof source.domain === "string" ? { domain: source.domain } : {}),
      ...(typeof source.excerpt === "string" ? { excerpt: source.excerpt } : {}),
    }];
  });
}

function sanitizeReviewMeta(value: unknown): ReviewResult["review_meta"] | undefined {
  const meta = objectValue(value);
  if (!meta) return undefined;

  return {
    ...(typeof meta.llm_provider === "string" ? { llm_provider: meta.llm_provider } : {}),
    ...(typeof meta.llm_model === "string" || meta.llm_model === null ? { llm_model: meta.llm_model } : {}),
    ...(typeof meta.llm_model_alias === "string" || meta.llm_model_alias === null ? { llm_model_alias: meta.llm_model_alias } : {}),
    ...(typeof meta.review_variant === "string" ? { review_variant: meta.review_variant } : {}),
    ...(meta.grounding_mode === "role_grounded" || meta.grounding_mode === "company_general" || meta.grounding_mode === "none"
      ? { grounding_mode: meta.grounding_mode }
      : {}),
    ...(typeof meta.primary_role === "string" ? { primary_role: meta.primary_role } : {}),
    ...(typeof meta.reference_es_count === "number" ? { reference_es_count: meta.reference_es_count } : {}),
    ...(meta.evidence_coverage_level === "not_applicable" ||
    meta.evidence_coverage_level === "none" ||
    meta.evidence_coverage_level === "weak" ||
    meta.evidence_coverage_level === "partial" ||
    meta.evidence_coverage_level === "strong"
      ? { evidence_coverage_level: meta.evidence_coverage_level }
      : {}),
    ...(typeof meta.weak_evidence_notice === "boolean" ? { weak_evidence_notice: meta.weak_evidence_notice } : {}),
    ...(meta.rewrite_validation_status === "strict_ok" ||
    meta.rewrite_validation_status === "soft_ok" ||
    meta.rewrite_validation_status === "degraded"
      ? { rewrite_validation_status: meta.rewrite_validation_status }
      : {}),
    ...(typeof meta.rewrite_validation_user_hint === "string" || meta.rewrite_validation_user_hint === null
      ? { rewrite_validation_user_hint: meta.rewrite_validation_user_hint }
      : {}),
    ...(meta.final_acceptance_source === "rewrite" ||
    meta.final_acceptance_source === "safe_rewrite" ||
    meta.final_acceptance_source === "length_fix" ||
    meta.final_acceptance_source === "degraded_best_effort"
      ? { final_acceptance_source: meta.final_acceptance_source }
      : {}),
    ...(typeof meta.ai_smell_tier === "number" ? { ai_smell_tier: meta.ai_smell_tier } : {}),
    ...(typeof meta.concrete_marker_count === "number" ? { concrete_marker_count: meta.concrete_marker_count } : {}),
    ...(typeof meta.opening_conclusion_chars === "number" ? { opening_conclusion_chars: meta.opening_conclusion_chars } : {}),
    ...(typeof meta.rewrite_sentence_count === "number" ? { rewrite_sentence_count: meta.rewrite_sentence_count } : {}),
  };
}

function sanitizeReviewResult(value: unknown): ReviewResult | null {
  const result = objectValue(value);
  if (!result || !Array.isArray(result.rewrites)) return null;

  const rewrites = result.rewrites.filter((rewrite): rewrite is string => typeof rewrite === "string");
  const templateReview = objectValue(result.template_review);
  const reviewMeta = sanitizeReviewMeta(result.review_meta);
  const billingOutcome = objectValue(result.billing_outcome);

  return {
    rewrites,
    ...(typeof result.improvement_explanation === "string"
      ? { improvement_explanation: result.improvement_explanation }
      : {}),
    ...(templateReview && isTemplateType(templateReview.template_type)
      ? {
          template_review: {
            template_type: templateReview.template_type,
            variants: [],
            keyword_sources: sanitizeTemplateSources(templateReview.keyword_sources),
          },
        }
      : {}),
    ...(reviewMeta ? { review_meta: reviewMeta } : {}),
    ...(billingOutcome ? { billing_outcome: billingOutcome as ReviewResult["billing_outcome"] } : {}),
  };
}

function normalizePublicESReviewEvent(value: unknown): SSEEvent | null {
  const event = objectValue(value);
  if (!event || typeof event.type !== "string") return null;

  if (event.type === "progress") {
    return {
      type: "progress",
      step: typeof event.step === "string" ? event.step : "analysis",
      progress: typeof event.progress === "number" ? event.progress : 0,
      ...(typeof event.label === "string" ? { label: event.label } : {}),
      ...(typeof event.subLabel === "string" ? { subLabel: event.subLabel } : {}),
    };
  }

  if (event.type === "rewrite_delta" && typeof event.text === "string") {
    return { type: "rewrite_delta", text: event.text };
  }

  if (event.type === "rewrite_complete" && typeof event.value === "string") {
    return { type: "rewrite_complete", value: event.value };
  }

  if (event.type === "explanation_complete" && typeof event.value === "string") {
    return { type: "explanation_complete", value: event.value };
  }

  if (event.type === "source_added") {
    const sources = sanitizeTemplateSources([event.source]);
    const source = sources[0];
    return source ? { type: "source_added", source } : null;
  }

  if (event.type === "complete") {
    const result = sanitizeReviewResult(event.result);
    if (!result) return null;
    return {
      type: "complete",
      result,
      ...(typeof event.creditCost === "number" ? { creditCost: event.creditCost } : {}),
    };
  }

  if (event.type === "error" && typeof event.message === "string") {
    return {
      type: "error",
      message: event.message,
      ...(typeof event.code === "string" ? { code: event.code } : {}),
      ...(typeof event.action === "string" ? { action: event.action } : {}),
      ...(typeof event.retryable === "boolean" ? { retryable: event.retryable } : {}),
    };
  }

  return null;
}

export function parseSSEEvent(text: string): SSEEvent | null {
  try {
    const dataMatch = text.match(/^data:\s*(.+)$/m);
    if (!dataMatch) {
      return null;
    }
    return normalizePublicESReviewEvent(JSON.parse(dataMatch[1]));
  } catch {
    console.warn("Failed to parse SSE event:", text);
    return null;
  }
}

export type ESReviewStreamResult =
  | {
      ok: true;
      result: ReviewResult;
      creditCost?: number;
    }
  | {
      ok: false;
      reason: "missing_reader" | "missing_complete" | "stream_error";
      message: string;
      code?: string;
      action?: string;
      retryable?: boolean;
    };

export async function consumeESReviewStream(args: {
  response: Response;
  onEvent: (event: SSEEvent) => void;
}): Promise<ESReviewStreamResult> {
  const reader = args.response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      reason: "missing_reader",
      message: "ストリーミングがサポートされていません",
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      if (!eventText.trim()) continue;

      const event = parseSSEEvent(eventText);
      if (!event) continue;

      args.onEvent(event);

      if (event.type === "complete") {
        return {
          ok: true,
          result: event.result,
          creditCost: event.creditCost,
        };
      }

      if (event.type === "error") {
        const errorEvent = event as SSEErrorEvent;
        return {
          ok: false,
          reason: "stream_error",
          message: errorEvent.message,
          code: errorEvent.code,
          action: errorEvent.action,
          retryable: errorEvent.retryable,
        };
      }
    }
  }

  return {
    ok: false,
    reason: "missing_complete",
    message: "添削結果を受信できませんでした",
  };
}
