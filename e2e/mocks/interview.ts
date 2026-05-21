import type { Page, Route } from "@playwright/test";
import {
  buildConversationStream,
  mockSseRoute,
  mockJsonRoute,
} from "./sse-helpers";

export const INTERVIEW_MOCK_COMPANY_ID = "interview-mock-company";

// ---------------------------------------------------------------------------
// RoleOptions mock
// ---------------------------------------------------------------------------

/**
 * Variants for mockInterviewRoleOptions:
 *
 * "generic_only"       — industry null, isFallback:true, generic groups only
 *                        (rooted in the fix: even without industry, roleGroups is non-empty)
 * "with_industry"      — IT industry resolved, isFallback:false
 * "with_applications"  — IT industry + "応募中の職種" group (source:"application_job_type")
 * "with_document"      — IT industry + "このESに紐づく職種" group (source:"document_job_type")
 * "api_error"          — HTTP 500
 */
export type RoleOptionsVariant =
  | "generic_only"
  | "with_industry"
  | "with_applications"
  | "with_document"
  | "api_error";

function buildGenericGroups() {
  return [
    {
      id: "generic_biz",
      label: "総合・営業系",
      options: [
        { value: "総合職", label: "総合職", source: "industry_default" },
        { value: "営業職", label: "営業職", source: "industry_default" },
      ],
    },
    {
      id: "generic_staff",
      label: "管理・スタッフ系",
      options: [
        { value: "事務職", label: "事務職", source: "industry_default" },
      ],
    },
  ];
}

function buildItGroups() {
  return [
    {
      id: "it_engineer",
      label: "エンジニア系",
      options: [
        { value: "エンジニア", label: "エンジニア", source: "industry_default" },
        { value: "インフラエンジニア", label: "インフラエンジニア", source: "industry_default" },
      ],
    },
    {
      id: "it_biz",
      label: "ビジネス系",
      options: [
        { value: "企画職", label: "企画職", source: "industry_default" },
        { value: "コンサルタント", label: "コンサルタント", source: "industry_default" },
      ],
    },
  ];
}

function buildRoleOptionsBody(
  companyId: string,
  variant: Exclude<RoleOptionsVariant, "api_error">,
) {
  const companyName = "株式会社テスト";

  if (variant === "generic_only") {
    return {
      companyId,
      companyName,
      industry: null,
      requiresIndustrySelection: true,
      industryOptions: ["IT・通信", "製造", "金融"],
      roleGroups: buildGenericGroups(),
      isFallback: true,
      fallbackReason: "industry_unresolved",
    };
  }

  const baseGroups = buildItGroups();

  if (variant === "with_applications") {
    return {
      companyId,
      companyName,
      industry: "IT・通信",
      requiresIndustrySelection: false,
      industryOptions: ["IT・通信"],
      roleGroups: [
        ...baseGroups,
        {
          id: "applied_jobs",
          label: "応募中の職種",
          options: [
            { value: "プロダクトマネージャー", label: "プロダクトマネージャー", source: "application_job_type" },
          ],
        },
      ],
      isFallback: false,
      fallbackReason: null,
    };
  }

  if (variant === "with_document") {
    return {
      companyId,
      companyName,
      industry: "IT・通信",
      requiresIndustrySelection: false,
      industryOptions: ["IT・通信"],
      roleGroups: [
        ...baseGroups,
        {
          id: "doc_jobs",
          label: "このESに紐づく職種",
          options: [
            { value: "データサイエンティスト", label: "データサイエンティスト", source: "document_job_type" },
          ],
        },
      ],
      isFallback: false,
      fallbackReason: null,
    };
  }

  // "with_industry"
  return {
    companyId,
    companyName,
    industry: "IT・通信",
    requiresIndustrySelection: false,
    industryOptions: ["IT・通信"],
    roleGroups: baseGroups,
    isFallback: false,
    fallbackReason: null,
  };
}

/**
 * Intercept the per-company es-role-options route (glob pattern) and fulfil it
 * with the specified variant payload.
 */
export async function mockInterviewRoleOptions(
  page: Page,
  companyId: string,
  variant: RoleOptionsVariant,
): Promise<void> {
  await page.route(
    `**/api/companies/${companyId}/es-role-options**`,
    async (route: Route) => {
      if (variant === "api_error") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "internal server error" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildRoleOptionsBody(companyId, variant)),
      });
    },
  );
}

/**
 * Mock `/api/companies/${companyId}/interview` (GET) with a fresh setup-pending
 * conversation.  Callers can override fields by passing `overrides`.
 */
export async function mockInterviewData(
  page: Page,
  companyId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await mockJsonRoute(page, `**/api/companies/${companyId}/interview`, {
    company: { id: companyId, name: "株式会社テスト", industry: "IT・通信" },
    conversation: null,
    materials: [],
    creditCost: 6,
    billingCosts: { start: 2, turn: 1, continue: 1, feedback: 6 },
    sessionState: {
      status: "setup_pending",
      isActive: false,
      isLegacySession: false,
      questionCount: 0,
      hasFeedback: false,
    },
    feedbackHistories: [],
    setup: {
      selectedIndustry: null,
      selectedRole: null,
      selectedRoleSource: null,
      resolvedIndustry: null,
      requiresIndustrySelection: false,
      industryOptions: [],
      roleTrack: "biz_general",
      interviewFormat: "standard_behavioral",
      selectionType: "fulltime",
      interviewStage: "early",
      interviewerType: "hr",
      strictnessMode: "standard",
    },
    ...overrides,
  });
}

export function buildInterviewTurnStream(opts?: {
  question?: string;
  questionStage?: string;
  turnId?: string;
}): string {
  const question = opts?.question ?? "学生時代に最も力を入れたことを教えてください。";
  return buildConversationStream({
    questionText: question,
    completeData: {
      turn_state: {
        turn_id: opts?.turnId ?? "turn-1",
        question,
      },
      turn_meta: {
        question_stage: opts?.questionStage ?? "gakuchika",
        strictness: "standard",
      },
      interview_plan: {
        role: "総合職",
        company_name: "株式会社テスト",
      },
      question_stage: opts?.questionStage ?? "gakuchika",
      question_flow_completed: false,
    },
    progressSteps: [
      { step: "plan", progress: 20, label: "面接プラン作成中" },
      { step: "turn", progress: 60, label: "質問生成中" },
    ],
  });
}

export async function mockInterviewApis(
  page: Page,
  companyId: string = INTERVIEW_MOCK_COMPANY_ID,
): Promise<void> {
  await mockJsonRoute(page, `**/api/companies/${companyId}`, {
    company: {
      id: companyId,
      name: "株式会社テスト",
      industry: "IT・通信",
    },
  });

  await mockJsonRoute(page, `**/api/companies/${companyId}/interview/sessions`, {
    sessions: [],
  });

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/interview/sessions`,
    {
      session: {
        id: "session-mock-1",
        companyId,
        status: "active",
        createdAt: "2025-01-01T00:00:00Z",
      },
    },
    "POST",
  );

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/interview/sessions/session-mock-1`,
    {
      session: {
        id: "session-mock-1",
        companyId,
        status: "active",
        turns: [],
        interviewPlan: { role: "総合職", company_name: "株式会社テスト" },
      },
    },
  );

  await mockSseRoute(
    page,
    `**/api/companies/${companyId}/interview/sessions/*/turn`,
    buildInterviewTurnStream(),
  );

  await mockJsonRoute(
    page,
    `**/api/companies/${companyId}/interview/sessions/*/feedback`,
    {
      feedback: {
        overall: "全体的に良い回答でした。",
        strengths: ["具体性がある"],
        improvements: ["もう少し数字を使うと良い"],
        score: 75,
      },
    },
    "POST",
  );
}
