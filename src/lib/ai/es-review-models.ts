export const STANDARD_ES_REVIEW_MODEL_OPTIONS = [
  { value: "claude-sonnet", label: "Claude Sonnet 4.5", enabled: true },
  { value: "gpt-5.1", label: "GPT-5.1", enabled: true },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", enabled: false, disabledReason: "現在調整中" },
  { value: "command-a-03-2025", label: "Cohere Command A", enabled: false, disabledReason: "現在調整中" },
  { value: "deepseek-chat", label: "DeepSeek V3.2", enabled: false, disabledReason: "現在調整中" },
] as const;

export type StandardESReviewModel = (typeof STANDARD_ES_REVIEW_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_STANDARD_ES_REVIEW_MODEL: StandardESReviewModel = "claude-sonnet";

const STANDARD_ES_REVIEW_MODEL_LABELS = new Map(
  STANDARD_ES_REVIEW_MODEL_OPTIONS.map((option) => [option.value, option.label] as const),
);
const STANDARD_ES_REVIEW_MODEL_OPTIONS_MAP = new Map(
  STANDARD_ES_REVIEW_MODEL_OPTIONS.map((option) => [option.value, option] as const),
);

export function isStandardESReviewModel(value: string): value is StandardESReviewModel {
  return STANDARD_ES_REVIEW_MODEL_LABELS.has(value as StandardESReviewModel);
}

export function getStandardESReviewModelLabel(model: string): string {
  return STANDARD_ES_REVIEW_MODEL_LABELS.get(model as StandardESReviewModel) ?? model;
}

export function getStandardESReviewModelOption(model: string) {
  return STANDARD_ES_REVIEW_MODEL_OPTIONS_MAP.get(model as StandardESReviewModel) ?? null;
}

export function isSelectableStandardESReviewModel(model: string): model is StandardESReviewModel {
  return Boolean(getStandardESReviewModelOption(model)?.enabled);
}
