type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

async function getCsrfToken(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  let token = readCookie("csrf_token");
  if (token) return decodeURIComponent(token);

  await fetch("/api/csrf", {
    method: "GET",
    credentials: "include",
  });
  token = readCookie("csrf_token");
  return token ? decodeURIComponent(token) : null;
}

async function postJson(path: string, payload?: Record<string, JsonValue | undefined>) {
  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  return fetch(path, {
    method: "POST",
    headers,
    credentials: "include",
    body: payload === undefined ? undefined : JSON.stringify(payload),
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
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/new`);
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
  payload: { charLimit: 300 | 400 | 500; sessionId?: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/generate-es-draft`, payload);
}

export function discardGeneratedGakuchikaDraft(
  gakuchikaId: string,
  payload: { sessionId: string | null; documentId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/discard-generated-draft`, payload);
}

export function generateGakuchikaInterviewSummary(
  gakuchikaId: string,
  payload: { sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/interview-summary`, payload);
}
