import { describe, expect, it } from "vitest";

import {
  motivationDraftDirectRequestSchema,
  motivationSetupRequestSchema,
  toMotivationRoleContextSource,
} from "./setup-request";

describe("motivation setup request contract", () => {
  it("accepts a resolved industry setup request", () => {
    const result = motivationSetupRequestSchema.safeParse({
      selectedIndustry: "銀行",
      selectedIndustrySource: "user_selected",
      selectedRole: "企画職",
      roleSelectionSource: "industry_default",
    });

    expect(result.success).toBe(true);
  });

  it("accepts legacy setup requests without selectedIndustry", () => {
    const result = motivationSetupRequestSchema.safeParse({
      selectedRole: "企画職",
      roleSelectionSource: "profile",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selectedIndustry).toBeNull();
      expect(result.data.selectedIndustrySource).toBeNull();
    }
  });

  it("rejects user_selected source without selectedIndustry", () => {
    const result = motivationSetupRequestSchema.safeParse({
      selectedIndustry: null,
      selectedIndustrySource: "user_selected",
      selectedRole: "企画職",
      roleSelectionSource: "profile",
    });

    expect(result.success).toBe(false);
  });

  it("accepts direct draft char limits while preserving setup validation", () => {
    const result = motivationDraftDirectRequestSchema.safeParse({
      charLimit: 400,
      selectedIndustry: "IT・通信",
      selectedIndustrySource: "company_field",
      selectedRole: "企画職",
      roleSelectionSource: null,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["custom", "user_free_text"],
    ["user_free_text", "user_free_text"],
    ["application_job_type", "application_job_type"],
    ["profile", "profile"],
    ["company_doc", "company_doc"],
    ["industry_default", null],
    ["company_override", null],
    ["document_job_type", null],
    [null, null],
  ] as const)("maps request role source %s to context source %s", (input, expected) => {
    expect(toMotivationRoleContextSource(input)).toBe(expected);
  });
});
