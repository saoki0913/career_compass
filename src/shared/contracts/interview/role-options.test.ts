import { describe, expect, it } from "vitest";
import {
  ROLE_OPTION_SOURCES,
  ROLE_OPTIONS_FALLBACK_REASONS,
  roleGroupSchema,
  roleOptionSchema,
  roleOptionSourceSchema,
  roleOptionsFallbackReasonSchema,
  roleOptionsResponseSchema,
  roleSelectionSourceSchema,
} from "./role-options";

describe("roleOptionSourceSchema", () => {
  it("accepts every declared source", () => {
    for (const source of ROLE_OPTION_SOURCES) {
      expect(roleOptionSourceSchema.parse(source)).toBe(source);
    }
  });

  it("rejects unknown sources and the UI-only custom value", () => {
    expect(roleOptionSourceSchema.safeParse("custom").success).toBe(false);
    expect(roleOptionSourceSchema.safeParse("profile").success).toBe(false);
    expect(roleOptionSourceSchema.safeParse("").success).toBe(false);
  });
});

describe("roleSelectionSourceSchema", () => {
  it("is the option sources plus the custom free-input marker", () => {
    for (const source of ROLE_OPTION_SOURCES) {
      expect(roleSelectionSourceSchema.parse(source)).toBe(source);
    }
    expect(roleSelectionSourceSchema.parse("custom")).toBe("custom");
  });

  it("rejects motivation-only persistence sources", () => {
    expect(roleSelectionSourceSchema.safeParse("user_free_text").success).toBe(false);
    expect(roleSelectionSourceSchema.safeParse("company_doc").success).toBe(false);
  });
});

describe("roleOptionSchema", () => {
  it("parses a well-formed option", () => {
    const parsed = roleOptionSchema.parse({
      value: "総合職",
      label: "総合職",
      source: "industry_default",
    });
    expect(parsed.value).toBe("総合職");
  });

  it("rejects extra keys via strict()", () => {
    const result = roleOptionSchema.safeParse({
      value: "総合職",
      label: "総合職",
      source: "industry_default",
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid source", () => {
    const result = roleOptionSchema.safeParse({
      value: "x",
      label: "x",
      source: "custom",
    });
    expect(result.success).toBe(false);
  });
});

describe("roleGroupSchema", () => {
  it("parses nested options", () => {
    const parsed = roleGroupSchema.parse({
      id: "course",
      label: "採用コース / 職群",
      options: [{ value: "総合職", label: "総合職", source: "industry_default" }],
    });
    expect(parsed.options).toHaveLength(1);
  });

  it("accepts an empty option list at the schema level", () => {
    expect(roleGroupSchema.safeParse({ id: "x", label: "x", options: [] }).success).toBe(true);
  });
});

describe("roleOptionsFallbackReasonSchema", () => {
  it("accepts declared reasons", () => {
    for (const reason of ROLE_OPTIONS_FALLBACK_REASONS) {
      expect(roleOptionsFallbackReasonSchema.parse(reason)).toBe(reason);
    }
  });

  it("rejects unknown reasons", () => {
    expect(roleOptionsFallbackReasonSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("roleOptionsResponseSchema", () => {
  const base = {
    companyId: "company-1",
    companyName: "テスト株式会社",
    industry: "IT・通信",
    requiresIndustrySelection: false,
    industryOptions: ["IT・通信", "商社"],
    roleGroups: [
      {
        id: "course",
        label: "採用コース / 職群",
        options: [{ value: "総合職", label: "総合職", source: "industry_default" }],
      },
    ],
  };

  it("parses a response without the optional fallback meta (backward compatible)", () => {
    const parsed = roleOptionsResponseSchema.parse(base);
    expect(parsed.isFallback).toBeUndefined();
    expect(parsed.fallbackReason).toBeUndefined();
  });

  it("parses a fallback response with meta", () => {
    const parsed = roleOptionsResponseSchema.parse({
      ...base,
      industry: null,
      isFallback: true,
      fallbackReason: "industry_unresolved",
    });
    expect(parsed.isFallback).toBe(true);
    expect(parsed.fallbackReason).toBe("industry_unresolved");
  });

  it("allows a null industry and a null fallbackReason", () => {
    const parsed = roleOptionsResponseSchema.parse({
      ...base,
      industry: null,
      isFallback: false,
      fallbackReason: null,
    });
    expect(parsed.industry).toBeNull();
    expect(parsed.fallbackReason).toBeNull();
  });

  it("rejects a missing required field", () => {
    const { companyId: _omit, ...withoutCompanyId } = base;
    expect(roleOptionsResponseSchema.safeParse(withoutCompanyId).success).toBe(false);
  });

  it("rejects extra keys via strict()", () => {
    expect(roleOptionsResponseSchema.safeParse({ ...base, surprise: 1 }).success).toBe(false);
  });

  it("rejects an invalid fallbackReason", () => {
    const result = roleOptionsResponseSchema.safeParse({
      ...base,
      fallbackReason: "nope",
    });
    expect(result.success).toBe(false);
  });
});
