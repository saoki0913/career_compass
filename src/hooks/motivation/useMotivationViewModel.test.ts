import { describe, expect, it } from "vitest";

import {
  deriveMotivationDraftHelperText,
  useMotivationViewModel,
  type MotivationViewModelInput,
} from "./useMotivationViewModel";

const baseInput: MotivationViewModelInput = {
  messages: [],
  nextQuestion: null,
  questionCount: 0,
  isDraftReady: false,
  isTextStreaming: false,
  isGeneratingDraft: false,
  isLocked: false,
  generatedDraft: null,
  questionStage: null,
  stageStatus: null,
  conversationMode: "slot_fill",
  currentSlot: null,
  currentIntent: null,
  nextAdvanceCondition: null,
  progress: null,
  coachingFocus: null,
  causalGaps: [],
  evidenceCards: [],
  evidenceSummary: null,
  roleOptionsData: null,
  selectedIndustry: "",
  selectedRoleName: "",
  roleSelectionSource: null,
  customRoleInput: "",
  setupSnapshot: null,
  company: { id: "company-1", name: "テスト企業", industry: "IT" },
};

describe("useMotivationViewModel derivations", () => {
  it("requires industry only when role options ask for it", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      roleOptionsData: {
        companyId: "company-1",
        companyName: "テスト企業",
        industry: null,
        requiresIndustrySelection: true,
        industryOptions: ["IT"],
        roleGroups: [],
      },
      selectedRoleName: "企画職",
    });

    expect(vm.requiresIndustrySelection).toBe(true);
    expect(vm.effectiveIndustry).toBe("IT");
    expect(vm.isSetupComplete).toBe(true);
  });

  it("hides standalone question when the latest assistant message already has it", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      nextQuestion: "なぜこの会社ですか？",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "なぜこの会社ですか？",
        },
      ],
    });

    expect(vm.showStandaloneQuestion).toBe(false);
  });

  it("derives the draft helper text for post-draft deep dive", () => {
    expect(
      deriveMotivationDraftHelperText({
        isGeneratingDraft: false,
        showSetupScreen: false,
        isPostDraftMode: true,
        isDraftReady: true,
        isLocked: false,
      }),
    ).toContain("ES作成後の補足深掘り");
  });
});
