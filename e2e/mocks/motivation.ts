import type { Page } from "@playwright/test";
import {
  buildConversationStream,
  mockSseRoute,
  mockJsonRoute,
} from "./sse-helpers";

export const MOTIVATION_MOCK_COMPANY_ID = "motivation-mock-company";

const INITIAL_CONVERSATION = {
  messages: [
    {
      id: "assistant-1",
      role: "assistant",
      content: "株式会社テストを志望する理由を教えてください。",
    },
  ],
  nextQuestion: "株式会社テストを志望する理由を教えてください。",
  questionCount: 1,
  isCompleted: false,
  isDraftReady: false,
  scores: {
    company_understanding: 42,
    self_analysis: 36,
    career_vision: 28,
    differentiation: 33,
  },
  conversationMode: "slot_fill",
  progress: {
    completed: 1,
    total: 6,
    current_slot: "company_reason",
    current_slot_label: "企業志望理由",
    current_intent: "initial_capture",
    next_advance_condition: "この企業を選ぶ理由が1つ言えればOK",
    mode: "slot_fill",
  },
  currentSlot: "company_reason",
  currentIntent: "initial_capture",
  nextAdvanceCondition: "この企業を選ぶ理由が1つ言えればOK",
  causalGaps: [],
  evidenceSummary: "新卒採用ページ: 業務改革とDX支援を推進",
  evidenceCards: [
    {
      sourceId: "S1",
      title: "新卒採用ページ",
      contentType: "new_grad_recruitment",
      excerpt: "業務改革とDX支援を通じて、顧客課題の解決に取り組む。",
      sourceUrl: "https://example.com/recruit",
      relevanceLabel: "新卒採用",
    },
  ],
  questionStage: "company_reason",
  stageStatus: {
    current: "company_reason",
    completed: [],
    pending: ["self_connection", "desired_work", "value_contribution", "differentiation"],
  },
  coachingFocus: "企業志望理由",
  conversationContext: {
    selectedIndustry: "IT・通信",
    selectedRole: "企画職",
    selectedRoleSource: "industry_default",
  },
  setup: {
    selectedIndustry: "IT・通信",
    selectedRole: "企画職",
    selectedRoleSource: "industry_default",
    requiresIndustrySelection: false,
    resolvedIndustry: "IT・通信",
    isComplete: true,
    requiresRestart: false,
    hasSavedConversation: true,
  },
};

export function buildMotivationQuestionStream(opts?: {
  question?: string;
  stage?: string;
  nextAction?: string;
}): string {
  const question = opts?.question ?? "入社後にどんな仕事へ挑戦したいですか？";
  return buildConversationStream({
    questionText: question,
    completeData: {
      question,
      stage: opts?.stage ?? "desired_work",
      confirmedFacts: {
        industry_reason_confirmed: true,
        company_reason_confirmed: true,
        self_connection_confirmed: false,
        desired_work_confirmed: false,
        value_contribution_confirmed: false,
        differentiation_confirmed: false,
      },
      nextAction: opts?.nextAction ?? "ask",
    },
  });
}

export async function mockMotivationApis(
  page: Page,
  companyId: string = MOTIVATION_MOCK_COMPANY_ID,
): Promise<void> {
  await mockJsonRoute(page, `**/api/companies/${companyId}`, {
    company: {
      id: companyId,
      name: "株式会社テスト",
      industry: "IT・通信",
    },
  });

  await mockJsonRoute(page, `**/api/companies/${companyId}/es-role-options**`, {
    companyId,
    companyName: "株式会社テスト",
    industry: "IT・通信",
    requiresIndustrySelection: false,
    industryOptions: ["IT・通信"],
    roleGroups: [
      {
        id: "default",
        label: "職種候補",
        options: [{ value: "企画職", label: "企画職", source: "industry_default" }],
      },
    ],
  });

  await mockJsonRoute(
    page,
    `**/api/motivation/${companyId}/conversation`,
    INITIAL_CONVERSATION,
  );

  await mockSseRoute(
    page,
    `**/api/motivation/${companyId}/conversation/stream`,
    buildMotivationQuestionStream(),
  );

  await mockJsonRoute(
    page,
    `**/api/motivation/${companyId}/generate-draft`,
    {
      draft: "テスト志望動機です。企業のDX推進に共感し…",
      charCount: 200,
      keyPoints: ["企業理解"],
      companyKeywords: ["DX"],
      documentId: "doc-motivation-mock",
      nextQuestion: null,
      conversationMode: "slot_fill",
      causalGaps: [],
      stageStatus: {
        current: "differentiation",
        completed: [
          "industry_reason",
          "company_reason",
          "self_connection",
          "desired_work",
          "value_contribution",
          "differentiation",
        ],
        pending: [],
      },
      messages: [],
      evidenceSummary: null,
      evidenceCards: [],
      questionStage: "differentiation",
      coachingFocus: null,
      currentSlot: null,
      currentIntent: null,
      nextAdvanceCondition: null,
      progress: null,
    },
    "POST",
  );
}
