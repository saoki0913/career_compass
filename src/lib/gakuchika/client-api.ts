type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };

function postJson(path: string, payload?: Record<string, JsonValue | undefined>) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
}

export function fetchGakuchikaDetail(gakuchikaId: string) {
  return fetch(`/api/gakuchika/${gakuchikaId}`, {
    credentials: "include",
  });
}

export function fetchGakuchikaConversation(gakuchikaId: string, sessionId?: string) {
  const searchParams = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return fetch(`/api/gakuchika/${gakuchikaId}/conversation${searchParams}`, {
    credentials: "include",
  });
}

export function startGakuchikaConversation(gakuchikaId: string) {
  return fetch(`/api/gakuchika/${gakuchikaId}/conversation/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
}

export function streamGakuchikaConversation(
  gakuchikaId: string,
  payload: { answer: string; sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/stream`, payload);
}

export function resumeGakuchikaConversation(
  gakuchikaId: string,
  payload: { sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/resume`, payload);
}

export function generateGakuchikaEsDraft(
  gakuchikaId: string,
  payload: { charLimit: 300 | 400 | 500 },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/generate-es-draft`, payload);
}
