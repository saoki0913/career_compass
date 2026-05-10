import { describe, expect, it } from "vitest";

import type { Industry } from "@/lib/constants/industries";
import {
  buildSectionReviewRequestParams,
  deriveReviewPanelControllerState,
  type ReviewPanelSectionRequest,
} from "./review-panel-controller";

const SECTION: ReviewPanelSectionRequest = {
  sectionId: "section-1",
  sectionTitle: "志望理由を教えてください",
  sectionContent: "貴社の事業と自分の経験が重なるため志望します。",
  sectionCharLimit: 400,
};

const INDUSTRY: Industry = "IT・通信";

function derive(overrides: Partial<Parameters<typeof deriveReviewPanelControllerState>[0]> = {}) {
  return deriveReviewPanelControllerState({
    sectionReviewRequest: SECTION,
    selectedTemplate: "self_pr",
    internName: "",
    hasSelectedCompany: false,
    selectedIndustry: null,
    roleName: "",
    isFreeEsPlan: false,
    selectedStandardModel: "claude-sonnet",
    authPending: false,
    isAuthenticated: true,
    creditsLoading: false,
    hasCreditsError: false,
    balance: 100,
    isRoleOptionsLoading: false,
    roleOptionsError: null,
    isLoading: false,
    hasResponse: false,
    isPlaybackComplete: false,
    hasCompletedReview: false,
    isCancelling: false,
    error: null,
    setupErrorHighlight: false,
    ...overrides,
  });
}

describe("review panel controller", () => {
  it("blocks unauthenticated review attempts with the login CTA", () => {
    const state = derive({ isAuthenticated: false });

    expect(state.canStartReview).toBe(false);
    expect(state.footerLoginHref).toBe("/login");
    expect(state.footerButtonLabel).toBe("ログインして添削する");
    expect(state.reviewActionHint).toBe("AI添削はログインユーザー向け機能です。");
  });

  it("surfaces template setup requirements before role decisions", () => {
    const state = derive({
      selectedTemplate: "intern_reason",
      internName: "",
      hasSelectedCompany: true,
      selectedIndustry: INDUSTRY,
      roleName: "",
      setupErrorHighlight: true,
    });

    expect(state.canStartReview).toBe(false);
    expect(state.requiresInternName).toBe(true);
    expect(state.footerHelperLines).toEqual([
      "赤字の枠内を入力・選択してください。",
      "インターン名を入力してください。",
    ]);
  });

  it("requires industry and role for company motivation reviews with a selected company", () => {
    const state = derive({
      selectedTemplate: "company_motivation",
      hasSelectedCompany: true,
      selectedIndustry: null,
      roleName: "",
      setupErrorHighlight: true,
    });

    expect(state.requiresIndustrySelection).toBe(true);
    expect(state.requiresRoleSelection).toBe(true);
    expect(state.validationIssues.map((issue) => issue.field)).toEqual(["industry", "role_name"]);
    expect(state.reviewActionHint).toBe("先に業界を選択してください。");
  });

  it("builds the hook request payload and omits optional fields that are not active", () => {
    expect(
      buildSectionReviewRequestParams({
        sectionReviewRequest: SECTION,
        companyId: "company-1",
        selectedTemplate: "self_pr",
        requiresInternName: false,
        internName: "夏季インターン",
        selectedRoleName: "",
        selectedIndustry: INDUSTRY,
        roleSelectionSource: null,
        reviewMode: "standard",
        isFreeEsPlan: true,
        selectedStandardModel: "claude-sonnet",
      }),
    ).toEqual({
      sectionTitle: SECTION.sectionTitle,
      sectionId: SECTION.sectionId,
      sectionContent: SECTION.sectionContent,
      sectionCharLimit: SECTION.sectionCharLimit,
      companyId: "company-1",
      templateType: "self_pr",
      internName: undefined,
      roleName: undefined,
      industryOverride: INDUSTRY,
      roleSelectionSource: undefined,
      reviewMode: "standard",
      llmModel: "low-cost",
    });
  });
});
