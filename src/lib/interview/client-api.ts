type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };

function postJson(path: string, payload: Record<string, JsonValue | undefined>, signal?: AbortSignal) {
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

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
