import "server-only";

import { createInternalServiceJwt } from "@/lib/fastapi/internal-jwt";
import {
  CAREER_PRINCIPAL_HEADER,
  createCareerPrincipalHeader,
  type CreateCareerPrincipalInput,
} from "@/lib/fastapi/career-principal";

function normalizeConfiguredUrl(value?: string) {
  return value?.trim().replace(/^['"]+|['"]+$/g, "");
}

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

/**
 * Call FastAPI as the service (internal JWT) AND attach a signed
 * `X-Career-Principal` header identifying the end-actor and scope.
 *
 * Use this for endpoints that need to enforce actor-level authorization beyond
 * the service boundary — e.g. company-info RAG (must assert the principal owns
 * `company_id`) or AI SSE (must assert the principal for concurrency leases).
 *
 * `fetchFastApiInternal` remains the default for endpoints where service-level
 * trust is sufficient.
 */
export async function fetchFastApiWithPrincipal(
  path: string,
  init: RequestInit & { principal: CreateCareerPrincipalInput },
) {
  const { principal, ...rest } = init;
  const baseUrl = getFastApiBaseUrl();
  const jwt = createInternalServiceJwt(baseUrl);
  const headers = new Headers(rest.headers);

  if (jwt && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${jwt}`);
  }

  if (!headers.has(CAREER_PRINCIPAL_HEADER)) {
    headers.set(CAREER_PRINCIPAL_HEADER, createCareerPrincipalHeader(principal));
  }

  return fetch(getFastApiUrl(path), {
    ...rest,
    headers,
  });
}
