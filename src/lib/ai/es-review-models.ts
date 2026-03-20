export const STANDARD_ES_REVIEW_MODEL_OPTIONS = [
  { value: "claude-sonnet", label: "Claude" },
  { value: "gpt", label: "GPT" },
  { value: "gemini", label: "Gemini" },
  {
    value: "low-cost",
    label: "クレジット消費を抑えて添削",
    helper: "品質はやや下がる可能性があります。",
  },
] as const;

export type StandardESReviewModel = (typeof STANDARD_ES_REVIEW_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_STANDARD_ES_REVIEW_MODEL: StandardESReviewModel = "claude-sonnet";

const STANDARD_ES_REVIEW_MODEL_LABELS = new Map(
  STANDARD_ES_REVIEW_MODEL_OPTIONS.map((option) => [option.value, option.label] as const),
);

const STANDARD_ES_REVIEW_MODEL_HELPERS: Partial<Record<StandardESReviewModel, string>> = {
  "low-cost": "品質はやや下がる可能性があります。",
};

export function isStandardESReviewModel(value: string): value is StandardESReviewModel {
  return STANDARD_ES_REVIEW_MODEL_LABELS.has(value as StandardESReviewModel);
}

export function getStandardESReviewModelLabel(model: string): string {
  return STANDARD_ES_REVIEW_MODEL_LABELS.get(model as StandardESReviewModel) ?? model;
}

export function getStandardESReviewModelHelper(model: string): string | null {
  return STANDARD_ES_REVIEW_MODEL_HELPERS[model as StandardESReviewModel] ?? null;
}

export function isLowCostESReviewModel(model: string | null | undefined): boolean {
  return model === "low-cost";
}
