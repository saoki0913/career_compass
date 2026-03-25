import { describe, expect, it } from "vitest";

import { getReviewValidationIssues } from "./review-panel-validation";

describe("review panel validation", () => {
  it("returns all missing fields in UI order", () => {
    expect(
      getReviewValidationIssues({
        sectionContent: "あいうえおかきくけこ",
        requiresInternName: true,
        internName: "",
        hasSelectedCompany: true,
        requiresIndustrySelection: true,
        selectedIndustry: null,
        selectedRoleName: "",
      }).map((issue) => issue.field),
    ).toEqual(["intern_name", "industry", "role_name"]);
  });

  it("skips industry when the company does not require explicit industry selection", () => {
    expect(
      getReviewValidationIssues({
        sectionContent: "あいうえおかきくけこ",
        requiresInternName: false,
        internName: "",
        hasSelectedCompany: true,
        requiresIndustrySelection: false,
        selectedIndustry: "IT・ソフトウェア",
        selectedRoleName: "",
      }).map((issue) => issue.field),
    ).toEqual(["role_name"]);
  });

  it("returns no issues when all required inputs are present", () => {
    expect(
      getReviewValidationIssues({
        sectionContent: "あいうえおかきくけこ",
        requiresInternName: true,
        internName: "夏季インターン",
        hasSelectedCompany: true,
        requiresIndustrySelection: true,
        selectedIndustry: "IT・ソフトウェア",
        selectedRoleName: "企画職",
      }),
    ).toEqual([]);
  });

  it("flags short section body before other fields", () => {
    expect(
      getReviewValidationIssues({
        sectionContent: "短い",
        requiresInternName: true,
        internName: "",
        hasSelectedCompany: true,
        requiresIndustrySelection: true,
        selectedIndustry: null,
        selectedRoleName: "",
      }).map((issue) => issue.field),
    ).toEqual(["section_content", "intern_name", "industry", "role_name"]);
  });

  it("accepts section body at exactly MIN length (trimmed)", () => {
    expect(
      getReviewValidationIssues({
        sectionContent: "あいうえお",
        requiresInternName: false,
        internName: "",
        hasSelectedCompany: false,
        requiresIndustrySelection: false,
        selectedIndustry: null,
        selectedRoleName: "",
      }),
    ).toEqual([]);
  });
});
