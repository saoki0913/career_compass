import { describe, expect, it } from "vitest";
import { inferTemplateTypeDetailsFromQuestion } from "./infer-template-type";
import {
  buildCompanyMotivationEsSectionTitle,
  buildGakuchikaEsSectionTitle,
} from "./es-document-section-titles";

describe("es-document-section-titles", () => {
  it("buildGakuchikaEsSectionTitle yields high-confidence gakuchika for inferTemplateTypeDetailsFromQuestion", () => {
    const title = buildGakuchikaEsSectionTitle("学園祭での改善");
    expect(inferTemplateTypeDetailsFromQuestion(title)).toMatchObject({
      templateType: "gakuchika",
      confidence: "high",
      matchedRule: "gakuchika",
    });
  });

  it("buildGakuchikaEsSectionTitle handles whitespace-only topic as prefix-only title", () => {
    const title = buildGakuchikaEsSectionTitle("   ");
    expect(inferTemplateTypeDetailsFromQuestion(title)).toMatchObject({
      templateType: "gakuchika",
      confidence: "high",
    });
  });

  it("buildCompanyMotivationEsSectionTitle yields high-confidence company_motivation", () => {
    const title = buildCompanyMotivationEsSectionTitle();
    expect(inferTemplateTypeDetailsFromQuestion(title)).toMatchObject({
      templateType: "company_motivation",
      confidence: "high",
      matchedRule: "company_motivation",
    });
  });
});
