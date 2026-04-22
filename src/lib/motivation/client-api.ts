type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function buildJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

function withQuery(basePath: string, query?: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

async function request(
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
}

export async function fetchMotivationCompany(companyId: string) {
  return request(`/api/companies/${companyId}`, {
    headers: buildJsonHeaders(),
  });
}

export async function fetchMotivationConversation(companyId: string) {
  return request(`/api/motivation/${companyId}/conversation`, {
    headers: buildJsonHeaders(),
  });
}

export async function fetchMotivationRoleOptions(companyId: string, industryOverride?: string | null) {
  return request(
    withQuery(`/api/companies/${companyId}/es-role-options`, { industry: industryOverride ?? null }),
    {
      headers: buildJsonHeaders(),
    },
  );
}

export async function startMotivationConversation(
  companyId: string,
  payload: Record<string, JsonValue>,
) {
  return request(`/api/motivation/${companyId}/conversation/start`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function streamMotivationConversation(
  companyId: string,
  payload: Record<string, JsonValue>,
  signal: AbortSignal,
) {
  return request(`/api/motivation/${companyId}/conversation/stream`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
    signal,
  });
}

export async function generateMotivationDraft(
  companyId: string,
  payload: Record<string, JsonValue>,
) {
  return request(`/api/motivation/${companyId}/generate-draft`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function generateMotivationDraftDirect(
  companyId: string,
  payload: Record<string, JsonValue>,
) {
  return request(`/api/motivation/${companyId}/generate-draft-direct`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function saveMotivationDraft(companyId: string) {
  return request(`/api/motivation/${companyId}/save-draft`, {
    method: "POST",
    headers: buildJsonHeaders(),
  });
}

export async function resumeMotivationDeepDive(companyId: string) {
  return request(`/api/motivation/${companyId}/resume-deepdive`, {
    method: "POST",
    headers: buildJsonHeaders(),
  });
}

export async function resetMotivationConversation(companyId: string) {
  return request(`/api/motivation/${companyId}/conversation`, {
    method: "DELETE",
    headers: buildJsonHeaders(),
  });
}
