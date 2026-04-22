import { TEMPLATE_LABELS, type TemplateType } from "@/hooks/useESReview";
import type { InferredESReviewTemplateDetails } from "@/lib/es-review/infer-template-type";

interface BuildTemplateRecommendationCopyInput {
  selectedTemplate: TemplateType | null;
  details: Pick<InferredESReviewTemplateDetails, "templateType" | "confidence" | "rationale">;
}

export type TemplateRecommendationCopy = {
  label: string;
  description: string;
  selectionDiffersFromInference: boolean;
};

export function buildTemplateRecommendationCopy(input: BuildTemplateRecommendationCopyInput): TemplateRecommendationCopy {
  const recommendedLabel = TEMPLATE_LABELS[input.details.templateType];
  if (input.selectedTemplate && input.selectedTemplate !== input.details.templateType) {
    return {
      label: `推奨: ${recommendedLabel}`,
      description: `現在は${TEMPLATE_LABELS[input.selectedTemplate]}を選択中です。${input.details.rationale}`,
      selectionDiffersFromInference: true,
    };
  }

  return {
    label: `自動判定: ${recommendedLabel}`,
    description:
      input.details.confidence === "low"
        ? `${input.details.rationale}必要なら変更してください。`
        : input.details.rationale,
    selectionDiffersFromInference: false,
  };
}
