import { describe, expect, it } from "vitest";

import type { MotivationConversationContext, MotivationScores } from "./conversation";
import {
  buildMotivationConversationPayload,
  buildMotivationEvidenceSummaryFromCards,
  buildMotivationUserEvidenceCards,
} from "./conversation-payload";

const BASE_CONTEXT: MotivationConversationContext = {
  conversationMode: "slot_fill",
  draftSource: "conversation",
  selectedIndustry: "IT・通信",
  selectedRole: "企画職",
  selectedRoleSource: "profile",
  userAnchorStrengths: [],
  userAnchorEpisodes: [],
  profileAnchorIndustries: [],
  profileAnchorJobTypes: [],
  companyAnchorKeywords: [],
  companyRoleCandidates: [],
  companyWorkCandidates: [],
  turnCount: 0,
  deepdiveTurnCount: 0,
  questionStage: "company_reason",
  stageAttemptCount: 0,
  confirmedFacts: {
    industry_reason_confirmed: true,
    company_reason_confirmed: false,
    self_connection_confirmed: false,
    desired_work_confirmed: false,
    value_contribution_confirmed: false,
    differentiation_confirmed: false,
  },
  openSlots: [
    "company_reason",
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
  ],
  closedSlots: ["industry_reason"],
  recentlyClosedSlots: [],
  weakSlotRetries: {},
  slotStatusV2: {},
  draftBlockers: [],
  slotStates: {
    industry_reason: "locked",
    company_reason: "rough",
    self_connection: "empty",
  },
  slotSummaries: {},
  slotEvidenceSentences: {},
  slotIntentsAsked: {},
  reaskBudgetBySlot: {},
  forbiddenReasks: [],
  unresolvedPoints: [],
  causalGaps: [
    {
      id: "company_reason_specificity",
      slot: "company_reason",
      reason: "企業固有語が不足している",
      promptHint: "企業のどの特徴に惹かれたかを具体化する",
    },
  ],
  roleReason: null,
  roleReasonState: "empty",
  unlockReason: null,
  currentIntent: "specificity_check",
  nextAdvanceCondition: "企業のどの特徴に惹かれたかを1つ補えれば次に進みます。",
  lastQuestionMeta: {
    questionText: "株式会社テストのどこに魅力を感じますか？",
    question_stage: "company_reason",
  },
  draftReady: false,
  draftReadyUnlockedAt: null,
};

describe("motivation conversation payload helpers", () => {
  it("builds a canonical payload from persisted context defaults", () => {
    const scores: MotivationScores = {
      company_understanding: 40,
      self_analysis: 35,
      career_vision: 30,
      differentiation: 20,
    };

    const payload = buildMotivationConversationPayload({
      messages: [{ role: "assistant", content: "株式会社テストのどこに魅力を感じますか？" }],
      questionCount: 1,
      isDraftReady: false,
      scores,
      conversationContext: BASE_CONTEXT,
      persistedQuestionStage: null,
      stageStatus: null,
      evidenceCards: [
        {
          sourceId: "S1",
          title: "採用ページ",
          contentType: "new_grad_recruitment",
          excerpt: "DX支援を通じて顧客課題に向き合う。",
          sourceUrl: "https://example.com/recruit",
          relevanceLabel: "高",
        },
      ],
      generatedDraft: null,
      resolvedIndustry: "IT・通信",
      requiresIndustrySelection: false,
    });

    expect(payload.nextQuestion).toBe("株式会社テストのどこに魅力を感じますか？");
    expect(payload.questionStage).toBe("company_reason");
    expect(payload.currentSlot).toBe("company_reason");
    expect(payload.currentIntent).toBe("specificity_check");
    expect(payload.progress).toEqual({
      completed: 1,
      total: 6,
      current_slot: "company_reason",
      current_slot_label: null,
      current_intent: "specificity_check",
      next_advance_condition: "企業のどの特徴に惹かれたかを1つ補えれば次に進みます。",
      mode: "slot_fill",
    });
    expect(payload.causalGaps).toHaveLength(1);
    expect(payload.setup).toEqual({
      selectedIndustry: "IT・通信",
      selectedRole: "企画職",
      selectedRoleSource: "profile",
      requiresIndustrySelection: false,
      resolvedIndustry: "IT・通信",
      isComplete: true,
      requiresRestart: false,
      hasSavedConversation: true,
    });
    expect(payload.evidenceSummary).toBe("S1 採用ページ: DX支援を通じて顧客課題に向き合う。");
    expect(payload.userEvidenceCards).toEqual([]);
  });

  it("builds user evidence cards from confirmed slot summaries without internal keys", () => {
    const cards = buildMotivationUserEvidenceCards({
      ...BASE_CONTEXT,
      slotSummaries: {
        self_connection: "学園祭で関係者を巻き込み、課題を整理した経験があります。",
      },
      userAnchorStrengths: ["課題整理力"],
    });

    expect(cards).toEqual([
      expect.objectContaining({
        sourceId: "U1",
        title: "自分との接点",
        excerpt: "学園祭で関係者を巻き込み、課題を整理した経験があります。",
        relevanceLabel: "会話で確認",
      }),
      expect.objectContaining({
        sourceId: "U2",
        title: "登録済みの強み",
        excerpt: "課題整理力",
        relevanceLabel: "プロフィール/ガクチカ",
      }),
    ]);
    expect(cards.map((card) => card.title).join(" ")).not.toContain("self_connection");
  });

  it("builds a compact evidence summary from the first two cards", () => {
    expect(
      buildMotivationEvidenceSummaryFromCards([
        {
          sourceId: "S1",
          title: "採用ページ",
          contentType: "new_grad_recruitment",
          excerpt: "DX支援を通じて顧客課題に向き合う。",
          sourceUrl: "https://example.com/recruit",
          relevanceLabel: "高",
        },
        {
          sourceId: "S2",
          title: "事業紹介",
          contentType: "corporate_site",
          excerpt: "企業変革を支えるコンサルティング。",
          sourceUrl: "https://example.com/business",
          relevanceLabel: "高",
        },
        {
          sourceId: "S3",
          title: "社員インタビュー",
          contentType: "employee_interviews",
          excerpt: "若手でも裁量が大きい。",
          sourceUrl: "https://example.com/people",
          relevanceLabel: "中",
        },
      ]),
    ).toBe(
      "S1 採用ページ: DX支援を通じて顧客課題に向き合う。 / S2 事業紹介: 企業変革を支えるコンサルティング。",
    );
  });
});
