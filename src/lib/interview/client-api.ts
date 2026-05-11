import type { JsonValue } from "@/lib/shared";
import { postJson } from "@/lib/shared";

export function fetchInterviewData(companyId: string) {
  return fetch(`/api/companies/${companyId}/interview`, {
    credentials: "include",
  });
}

export function fetchInterviewRoleOptions(companyId: string) {
  return fetch(`/api/companies/${companyId}/es-role-options`, {
    credentials: "include",
  });
}

export function startInterviewStream(
  companyId: string,
  payload: Record<string, JsonValue | undefined>,
  signal: AbortSignal,
) {
  return postJson(`/api/companies/${companyId}/interview/start`, payload, signal);
}

export function sendInterviewAnswerStream(
  companyId: string,
  payload: Record<string, JsonValue | undefined>,
  signal: AbortSignal,
) {
  return postJson(`/api/companies/${companyId}/interview/stream`, payload, signal);
}

export function generateInterviewFeedbackStream(companyId: string, signal: AbortSignal) {
  return postJson(`/api/companies/${companyId}/interview/feedback`, {}, signal);
}

export function continueInterviewStream(companyId: string, signal: AbortSignal) {
  return postJson(`/api/companies/${companyId}/interview/continue`, {}, signal);
}

export function resetInterviewConversation(companyId: string) {
  return fetch(`/api/companies/${companyId}/interview/reset`, {
    method: "POST",
    credentials: "include",
  });
}

export function saveInterviewFeedbackSatisfaction(
  companyId: string,
  payload: { historyId: string; satisfactionScore: number },
) {
  return postJson(`/api/companies/${companyId}/interview/feedback/satisfaction`, payload);
}

export async function saveInterviewSheet(
  companyId: string,
  conversationId: string,
  historyId: string,
): Promise<{ sheetContent: string; feedbackHistoryId: string }> {
  const response = await postJson(
    `/api/companies/${companyId}/interview/sheet`,
    { conversationId, historyId },
  );
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorBody?.userMessage === "string"
        ? errorBody.userMessage
        : "面接確認シートの保存に失敗しました。",
    );
  }
  return (await response.json()) as { sheetContent: string; feedbackHistoryId: string };
}

// ---------------------------------------------------------------------------
// Phase 2 Stage 7: Weakness drill client helpers
// ---------------------------------------------------------------------------

export type InterviewDrillStartPayload = {
  weakestTurnId: string;
  weakestQuestion: string;
  weakestAnswer: string;
  weakestAxis: string;
  originalScore: number;
  weakestEvidence?: string[];
  originalScores?: Record<string, number>;
  originalFeedbackId?: string | null;
  interviewFormat?: string;
  interviewerType?: string;
  strictnessMode?: string;
};

export type InterviewDrillStartResult = {
  attemptId: string;
  whyWeak: string;
  improvementPattern: string;
  modelRewrite: string;
  retryQuestion: string;
  promptVersion?: string;
};

export type InterviewDrillScorePayload = {
  attemptId: string;
  retryAnswer: string;
};

export type InterviewDrillScoreResult = {
  attemptId: string;
  retryScores: Record<string, number>;
  deltaScores: Record<string, number>;
  rationale: string;
  promptVersion?: string;
};

export async function startInterviewDrill(
  companyId: string,
  payload: InterviewDrillStartPayload,
  signal?: AbortSignal,
): Promise<InterviewDrillStartResult> {
  const response = await postJson(
    `/api/companies/${companyId}/interview/drill/start`,
    payload as unknown as Record<string, JsonValue | undefined>,
    signal,
  );
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorBody?.userMessage === "string"
        ? errorBody.userMessage
        : "ドリルの開始に失敗しました。",
    );
  }
  return (await response.json()) as InterviewDrillStartResult;
}

export async function scoreInterviewDrill(
  companyId: string,
  payload: InterviewDrillScorePayload,
  signal?: AbortSignal,
): Promise<InterviewDrillScoreResult> {
  const response = await postJson(
    `/api/companies/${companyId}/interview/drill/score`,
    payload as unknown as Record<string, JsonValue | undefined>,
    signal,
  );
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorBody?.userMessage === "string"
        ? errorBody.userMessage
        : "再採点に失敗しました。",
    );
  }
  return (await response.json()) as InterviewDrillScoreResult;
}
