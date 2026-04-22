import { describe, expect, it } from "vitest";

import { buildTemplateRecommendationCopy } from "./template-recommendation";

describe("template recommendation copy", () => {
  it("summarizes the auto recommendation for the default state", () => {
    expect(
      buildTemplateRecommendationCopy({
        selectedTemplate: null,
        details: {
          templateType: "company_motivation",
          confidence: "high",
          rationale: "志望理由を示す語が明確です。",
        },
      }),
    ).toEqual({
      label: "自動判定: 志望理由",
      description: "志望理由を示す語が明確です。",
      selectionDiffersFromInference: false,
    });
  });

  it("shows that the user has overridden the recommendation", () => {
    expect(
      buildTemplateRecommendationCopy({
        selectedTemplate: "self_pr",
        details: {
          templateType: "company_motivation",
          confidence: "medium",
          rationale: "志望理由と強み訴求の両方が含まれています。",
        },
      }),
    ).toEqual({
      label: "推奨: 志望理由",
      description: "現在は自己PRを選択中です。志望理由と強み訴求の両方が含まれています。",
      selectionDiffersFromInference: true,
    });
  });

  it("adds a caution when the recommendation is low confidence", () => {
    expect(
      buildTemplateRecommendationCopy({
        selectedTemplate: null,
        details: {
          templateType: "basic",
          confidence: "low",
          rationale: "設問タイプが曖昧なため、汎用添削として扱います。",
        },
      }),
    ).toEqual({
      label: "自動判定: 汎用ES添削",
      description: "設問タイプが曖昧なため、汎用添削として扱います。必要なら変更してください。",
      selectionDiffersFromInference: false,
    });
  });
});
