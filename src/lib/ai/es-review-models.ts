export const STANDARD_ES_REVIEW_MODEL_OPTIONS = [
  { value: "claude-sonnet", label: "Claude Sonnet 4.6" },
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { value: "command-a-03-2025", label: "Cohere Command A" },
] as const;

export type StandardESReviewModel = (typeof STANDARD_ES_REVIEW_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_STANDARD_ES_REVIEW_MODEL: StandardESReviewModel = "claude-sonnet";

const STANDARD_ES_REVIEW_MODEL_LABELS = new Map(
  STANDARD_ES_REVIEW_MODEL_OPTIONS.map((option) => [option.value, option.label] as const),
);

export function isStandardESReviewModel(value: string): value is StandardESReviewModel {
  return STANDARD_ES_REVIEW_MODEL_LABELS.has(value as StandardESReviewModel);
}

export function getStandardESReviewModelLabel(model: string): string {
  return STANDARD_ES_REVIEW_MODEL_LABELS.get(model as StandardESReviewModel) ?? model;
}
