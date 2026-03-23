import {
  getStandardESReviewModelLabel as getKnownStandardESReviewModelLabel,
  isStandardESReviewModel,
} from "@/lib/ai/es-review-models";

function humanizeModelId(modelId: string): string {
  const lower = modelId.toLowerCase();

  if (isStandardESReviewModel(lower)) {
    return getKnownStandardESReviewModelLabel(lower);
  }
  if (lower.startsWith("claude-haiku")) {
    return "Claude Haiku 4.5";
  }
  if (lower.startsWith("claude-sonnet")) {
    return "Claude Sonnet 4.6";
  }
  if (lower.startsWith("gemini-3.1-pro-preview")) {
    return "Gemini 3 Pro Preview";
  }
  if (lower === "gpt-fast") {
    return "GPT-5.4-mini";
  }
  if (lower.startsWith("gemini")) {
    return "Gemini";
  }
  if (lower.startsWith("command-a")) {
    return "Cohere Command A";
  }
  if (lower.startsWith("gpt-5.4-mini")) {
    return "クレジット消費を抑えて添削";
  }
  if (lower.startsWith("gpt-5.4")) {
    return "GPT-5.4";
  }
  if (lower.startsWith("gpt-5-nano")) {
    return "GPT-5 Nano";
  }
  if (lower.startsWith("gpt-5")) {
    return "GPT-5";
  }
  if (lower.startsWith("gpt-4o-mini")) {
    return "GPT-4o Mini";
  }

  return modelId;
}

export function getLLMResultLabel(params: {
  provider?: string | null;
  modelId?: string | null;
  modelAlias?: string | null;
  reviewVariant?: string | null;
}): string | null {
  const { provider, modelId, modelAlias, reviewVariant } = params;
  void reviewVariant;

  if (modelAlias?.trim()) {
    return humanizeModelId(modelAlias.trim());
  }

  if (modelId?.trim()) {
    return humanizeModelId(modelId.trim());
  }

  if (provider === "claude") {
    return "Claude";
  }
  if (provider === "google") {
    return "Gemini";
  }
  if (provider === "cohere") {
    return "Cohere Command";
  }
  if (provider === "openai") {
    return "OpenAI";
  }

  return null;
}
