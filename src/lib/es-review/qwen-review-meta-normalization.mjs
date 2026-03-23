export const LOW_COST_REVIEW_META = Object.freeze({
  llm_provider: "openai",
  llm_model: "gpt-5.4-mini",
  llm_model_alias: "low-cost",
  review_variant: "standard",
});

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLegacyQwenReviewMeta(reviewMeta) {
  if (!isObject(reviewMeta)) {
    return false;
  }

  const provider = String(reviewMeta.llm_provider ?? "").trim().toLowerCase();
  const model = String(reviewMeta.llm_model ?? "").trim().toLowerCase();
  const modelAlias = String(reviewMeta.llm_model_alias ?? "").trim().toLowerCase();
  const reviewVariant = String(reviewMeta.review_variant ?? "").trim().toLowerCase();

  return (
    provider === "qwen-es-review" ||
    reviewVariant === "qwen3-beta" ||
    model.includes("qwen") ||
    modelAlias.includes("qwen")
  );
}

export function normalizeLegacyQwenReviewMeta(reviewMeta) {
  if (!isLegacyQwenReviewMeta(reviewMeta)) {
    return reviewMeta;
  }

  return {
    ...reviewMeta,
    ...LOW_COST_REVIEW_META,
  };
}

export function normalizeQwenReviewMessageContent(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      updated: false,
      reason: "invalid_json",
      error,
      content,
    };
  }

  if (!isObject(parsed) || parsed.type !== "es_review_v1" || !isObject(parsed.review_meta)) {
    return {
      ok: true,
      updated: false,
      reason: "not_target",
      content,
      parsed,
    };
  }

  if (!isLegacyQwenReviewMeta(parsed.review_meta)) {
    return {
      ok: true,
      updated: false,
      reason: "not_qwen",
      content,
      parsed,
    };
  }

  const nextPayload = {
    ...parsed,
    review_meta: normalizeLegacyQwenReviewMeta(parsed.review_meta),
  };
  const nextContent = JSON.stringify(nextPayload);

  return {
    ok: true,
    updated: nextContent !== content,
    reason: nextContent !== content ? "normalized" : "unchanged",
    content: nextContent,
    parsed: nextPayload,
  };
}
