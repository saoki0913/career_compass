import { getStandardESReviewModelLabel as getKnownStandardESReviewModelLabel } from "@/lib/ai/es-review-models";

function humanizeModelId(modelId: string): string {
  const lower = modelId.toLowerCase();

  if (lower === "claude-sonnet" || lower === "gpt-5.1" || lower === "gemini-3.1-pro-preview" || lower === "command-a-03-2025" || lower === "deepseek-chat") {
    return getKnownStandardESReviewModelLabel(lower);
  }
  if (lower.startsWith("claude-haiku")) {
    return "Claude Haiku 4.5";
  }
  if (lower.startsWith("claude-sonnet")) {
    return "Claude Sonnet 4.5";
  }
  if (lower.startsWith("gemini-3.1-pro-preview")) {
    return "Gemini 3.1 Pro Preview";
  }
  if (lower.startsWith("gemini")) {
    return "Gemini";
  }
  if (lower.startsWith("command-a")) {
    return "Cohere Command A";
  }
  if (lower.startsWith("deepseek-chat")) {
    return "DeepSeek V3.2";
  }
  if (lower.startsWith("deepseek-reasoner")) {
    return "DeepSeek Reasoner";
  }
  if (lower.startsWith("gpt-5.2")) {
    return "GPT-5.2";
  }
  if (lower.startsWith("gpt-5.1")) {
    return "GPT-5.1";
  }
  if (lower.startsWith("gpt-5-mini")) {
    return "GPT-5 Mini";
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
  reviewVariant?: string | null;
}): string | null {
  const { provider, modelId, reviewVariant } = params;

  if (reviewVariant === "qwen3-beta" || provider === "qwen-es-review") {
    return "Qwen3 Swallow 32B β";
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
  if (provider === "deepseek") {
    return "DeepSeek";
  }
  if (provider === "openai") {
    return "OpenAI";
  }

  return null;
}
