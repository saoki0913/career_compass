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
    expect(inferTemplateTypeDetailsFromQuestion("当社で大切にしたいことを教えてください。")).toEqual({
      templateType: "basic",
      confidence: "low",
      matchedRule: "fallback_basic",
    });
  });

  it("distinguishes role course reason from company motivation", () => {
    expect(inferTemplateTypeDetailsFromQuestion("デジタル企画コースを志望する理由を教えてください。")).toEqual({
      templateType: "role_course_reason",
      confidence: "high",
      matchedRule: "role_course_reason",
    });
  });

  it("treats intern goals as high-confidence only when goal verbs are explicit", () => {
    expect(inferTemplateTypeDetailsFromQuestion("インターンで学びたいことを教えてください。")).toEqual({
      templateType: "intern_goals",
      confidence: "high",
      matchedRule: "intern_goals",
    });
    expect(inferTemplateTypeDetailsFromQuestion("インターンについて教えてください。")).toEqual({
      templateType: "basic",
      confidence: "low",
      matchedRule: "fallback_basic",
    });
  });
});
