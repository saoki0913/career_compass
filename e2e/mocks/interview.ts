import type { Page } from "@playwright/test";
import {
  buildConversationStream,
  mockSseRoute,
  mockJsonRoute,
} from "./sse-helpers";

export const INTERVIEW_MOCK_COMPANY_ID = "interview-mock-company";

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
