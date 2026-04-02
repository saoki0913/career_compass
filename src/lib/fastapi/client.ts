import "server-only";

import { createInternalServiceJwt } from "@/lib/fastapi/internal-jwt";

function normalizeConfiguredUrl(value?: string) {
  return value?.trim().replace(/^['"]+|['"]+$/g, "");
}

function getFastApiBaseUrl() {
  const url =
    normalizeConfiguredUrl(process.env.FASTAPI_URL) ||
    normalizeConfiguredUrl(process.env.BACKEND_URL) ||
    "http://localhost:8000";
  return url.replace(/\/+$/, "");
}

export function getFastApiUrl(path: string) {
  const baseUrl = getFastApiBaseUrl();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchFastApiInternal(path: string, init: RequestInit = {}) {
  const baseUrl = getFastApiBaseUrl();
  const jwt = createInternalServiceJwt(baseUrl);
  const headers = new Headers(init.headers);

  if (jwt && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${jwt}`);
  }

  return fetch(getFastApiUrl(path), {
    ...init,
    headers,
  });
}
