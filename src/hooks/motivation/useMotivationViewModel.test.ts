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

  it("uses deriveMotivationModeLabel for detailed mode label", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      conversationMode: "slot_fill",
      questionCount: 1,
      isDraftReady: false,
    });
    expect(vm.motivationModeLabel).toBe("志望動機の土台を整えています");
  });

  it("shows deepdive gap count in mode label", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      conversationMode: "deepdive",
      isDraftReady: true,
      causalGaps: [
        { id: "g1", slot: "company_reason", reason: "r", promptHint: "h" },
        { id: "g2", slot: "self_connection", reason: "r", promptHint: "h" },
      ],
    });
    expect(vm.motivationModeLabel).toBe("補強中（残り2件）");
  });

  it("allows draft regeneration after an existing draft is present", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      isDraftReady: true,
      generatedDraft: "既存の志望動機です。",
      messages: [],
    });
    expect(vm.canGenerateDraft).toBe(true);
  });

  it("does not expose internal intent keys to the UI", () => {
    const vm = useMotivationViewModel({
      ...baseInput,
      currentIntent: "self_connection",
      currentSlot: "self_connection",
      progress: {
        completed: 3,
        total: 6,
        current_slot: "self_connection",
        current_slot_label: "self_connection",
        current_intent: "self_connection",
        next_advance_condition: null,
        mode: "deepdive",
      },
    });
    expect(vm.currentIntentLabel).toBe("補強ポイントを確認します");
    expect(vm.currentSlotLabel).toBe("自分との接続を整理中");
  });
});
