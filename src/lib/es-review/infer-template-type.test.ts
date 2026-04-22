import { describe, expect, it } from "vitest";
import {
  inferTemplateTypeDetailsFromQuestion,
  inferTemplateTypeFromQuestion,
} from "./infer-template-type";

describe("inferTemplateTypeFromQuestion", () => {
  it("infers gakuchika", () => {
    expect(inferTemplateTypeFromQuestion("学生時代に力を入れたことは何ですか。")).toBe("gakuchika");
  });

  it("infers company motivation", () => {
    expect(inferTemplateTypeFromQuestion("当社を志望する理由を教えてください。")).toBe("company_motivation");
  });

  it("defaults to basic for generic titles", () => {
    expect(inferTemplateTypeFromQuestion("自由記述")).toBe("basic");
  });

  it("keeps ambiguous company heading as basic in details helper", () => {
    expect(inferTemplateTypeDetailsFromQuestion("当社で大切にしたいことを教えてください。")).toMatchObject({
      templateType: "basic",
      confidence: "low",
      matchedRule: "fallback_basic",
      secondaryCandidates: ["work_values", "company_motivation"],
      requiresCompanyRag: false,
      recommendedGroundingLevel: "light",
    });
  });

  it("distinguishes role course reason from company motivation", () => {
    expect(
      inferTemplateTypeDetailsFromQuestion("デジタル企画コースを志望する理由を教えてください。"),
    ).toMatchObject({
      templateType: "role_course_reason",
      confidence: "high",
      matchedRule: "role_course_reason",
      secondaryCandidates: ["company_motivation"],
      requiresCompanyRag: true,
      recommendedGroundingLevel: "deep",
    });
  });

  it("treats intern goals as high-confidence only when goal verbs are explicit", () => {
    expect(inferTemplateTypeDetailsFromQuestion("インターンで学びたいことを教えてください。")).toMatchObject({
      templateType: "intern_goals",
      confidence: "high",
      matchedRule: "intern_goals",
      secondaryCandidates: ["intern_reason"],
      recommendedGroundingLevel: "standard",
    });
    expect(inferTemplateTypeDetailsFromQuestion("インターンについて教えてください。")).toMatchObject({
      templateType: "basic",
      confidence: "low",
      matchedRule: "fallback_basic",
      secondaryCandidates: ["intern_reason", "intern_goals"],
    });
  });

  it("recommends lighter grounding for companyless self-pr prompts", () => {
    expect(inferTemplateTypeDetailsFromQuestion("あなたの強みを教えてください。")).toMatchObject({
      templateType: "self_pr",
      confidence: "high",
      recommendedGroundingLevel: "light",
      requiresCompanyRag: false,
    });
  });

  it("returns rationale text for downstream UI guidance", () => {
    const details = inferTemplateTypeDetailsFromQuestion("入社後に挑戦したいことを教えてください。");

    expect(details.templateType).toBe("post_join_goals");
    expect(details.rationale).toContain("入社後");
  });
});
