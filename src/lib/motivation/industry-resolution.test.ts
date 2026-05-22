import { describe, expect, it } from "vitest";

import {
  isMotivationSetupReady,
  resolveIndustryState,
  selectIndustryStateFromRoleOptions,
  toRequestIndustry,
} from "./industry-resolution";

describe("motivation industry resolution", () => {
  it.each([
    { companyIndustry: null, expectedKind: "requires_selection", expectedIndustry: null },
    { companyIndustry: "金融・保険", expectedKind: "requires_selection", expectedIndustry: null },
    { companyIndustry: "IT・通信", expectedKind: "resolved", expectedIndustry: "IT・通信" },
    { companyIndustry: "自由入力の業界", expectedKind: "requires_selection", expectedIndustry: null },
  ])("resolves company industry: $companyIndustry", ({ companyIndustry, expectedKind, expectedIndustry }) => {
    const state = resolveIndustryState({ companyIndustry });

    expect(state.kind).toBe(expectedKind);
    expect(toRequestIndustry(state)).toBe(expectedIndustry);
  });

  it("uses a user-selected industry when company industry is broad", () => {
    const state = resolveIndustryState({
      companyIndustry: "金融・保険",
      selectedIndustry: "銀行",
    });

    expect(state).toEqual({
      kind: "resolved",
      industry: "銀行",
      source: "user_selected",
      industryOptions: expect.arrayContaining(["銀行"]),
    });
    expect(isMotivationSetupReady(state, "企画職")).toBe(true);
  });

  it("preserves an explicit company_field source for a resolved selected industry", () => {
    const state = resolveIndustryState({
      companyIndustry: "IT・通信",
      selectedIndustry: "IT・通信",
      selectedIndustrySource: "company_field",
    });

    expect(state).toEqual({
      kind: "resolved",
      industry: "IT・通信",
      source: "company_field",
      industryOptions: expect.arrayContaining(["IT・通信"]),
    });
  });

  it("keeps the resolved role-options industry after selection refetch flips the boolean", () => {
    const state = selectIndustryStateFromRoleOptions({
      companyIndustry: "金融・保険",
      userSelectedIndustry: "銀行",
      roleOptionsData: {
        companyId: "company-1",
        companyName: "テスト銀行",
        industry: "銀行",
        requiresIndustrySelection: false,
        industryOptions: ["銀行", "証券"],
        roleGroups: [],
      },
      setupSnapshot: null,
    });

    expect(state.kind).toBe("resolved");
    expect(toRequestIndustry(state)).toBe("銀行");
  });
});
