import type { JsonValue } from "@/lib/shared";
import { buildJsonHeaders, postJson, withQuery } from "@/lib/shared";
import type {
  MotivationDraftDirectRequestPayload,
  MotivationSetupRequestPayload,
} from "@/shared/contracts/motivation/setup-request";

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
  payload: MotivationSetupRequestPayload,
) {
  const jsonPayload: Record<string, JsonValue | undefined> = { ...payload };
  return postJson(`/api/motivation/${companyId}/conversation/start`, jsonPayload);
}

export async function streamMotivationConversation(
  companyId: string,
  payload: Record<string, JsonValue>,
  signal: AbortSignal,
) {
  return postJson(`/api/motivation/${companyId}/conversation/stream`, payload, signal);
}

export async function generateMotivationDraft(
  companyId: string,
  payload: Record<string, JsonValue>,
) {
  return postJson(`/api/motivation/${companyId}/generate-draft`, payload);
}

export async function generateMotivationDraftDirect(
  companyId: string,
  payload: MotivationDraftDirectRequestPayload,
) {
  const jsonPayload: Record<string, JsonValue | undefined> = { ...payload };
  return postJson(`/api/motivation/${companyId}/generate-draft-direct`, jsonPayload);
}

export async function saveMotivationDraft(companyId: string) {
  return postJson(`/api/motivation/${companyId}/save-draft`);
}

export async function resumeMotivationDeepDive(companyId: string) {
  return postJson(`/api/motivation/${companyId}/resume-deepdive`);
}

export async function resetMotivationConversation(companyId: string) {
  return request(`/api/motivation/${companyId}/conversation`, {
    method: "DELETE",
    headers: buildJsonHeaders(),
  });
}
