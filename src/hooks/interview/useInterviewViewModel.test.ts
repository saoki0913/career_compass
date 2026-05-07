import { describe, expect, it } from "vitest";

import {
  deriveInterviewWeakestAxis,
  normalizeInterviewCompanyId,
  useInterviewViewModel,
} from "./useInterviewViewModel";

describe("useInterviewViewModel derivations", () => {
  it("normalizes App Router dynamic params", () => {
    expect(normalizeInterviewCompanyId(" company-1 ")).toBe("company-1");
    expect(normalizeInterviewCompanyId(["company-2", "ignored"])).toBe("company-2");
    expect(normalizeInterviewCompanyId("   ")).toBeNull();
    expect(normalizeInterviewCompanyId(undefined)).toBeNull();
  });

  it("derives the weakest numeric feedback axis", () => {
    expect(
      deriveInterviewWeakestAxis({
        company_fit: 4,
        role_fit: 2,
        specificity: 3,
      }),
    ).toBe("role_fit");
  });

  it("combines normalized company id and weakest axis", () => {
    const vm = useInterviewViewModel({
      companyId: [" company-3 "],
      feedback: {
        overall_comment: "",
        scores: {
          logic: 5,
          persuasiveness: 1,
        },
        strengths: [],
        improvements: [],
        consistency_risks: [],
        improved_answer: "",
        next_preparation: [],
      },
    });

    expect(vm).toEqual({
      normalizedCompanyId: "company-3",
      weakestAxis: "persuasiveness",
    });
  });
});
