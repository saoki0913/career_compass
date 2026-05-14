import type { JsonValue } from "./types";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

let csrfInitPromise: Promise<string | null> | null = null;

export function buildJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export function withQuery(
  basePath: string,
  query?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

async function ensureClientCsrfToken(): Promise<string | null> {
  const existingToken = readCookie(CSRF_COOKIE_NAME);
  if (existingToken) return existingToken;

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof fetch === "undefined"
  ) {
    return null;
  }

  if (!csrfInitPromise) {
    csrfInitPromise = fetch("/api/csrf", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    })
      .catch(() => null)
      .then(() => readCookie(CSRF_COOKIE_NAME))
      .finally(() => {
        csrfInitPromise = null;
      });
  }

  return csrfInitPromise;
}

export async function postJson(
  path: string,
  payload?: Record<string, JsonValue | undefined>,
  signal?: AbortSignal,
): Promise<Response> {
  return mutateJson("POST", path, payload, signal);
}

export async function putJson(
  path: string,
  payload?: Record<string, JsonValue | undefined>,
  signal?: AbortSignal,
): Promise<Response> {
  return mutateJson("PUT", path, payload, signal);
}

export async function patchJson(
  path: string,
  payload?: Record<string, JsonValue | undefined>,
  signal?: AbortSignal,
): Promise<Response> {
  return mutateJson("PATCH", path, payload, signal);
}

export async function deleteJson(
  path: string,
  payload?: Record<string, JsonValue | undefined>,
  signal?: AbortSignal,
): Promise<Response> {
  return mutateJson("DELETE", path, payload, signal);
}

async function mutateJson(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  payload?: Record<string, JsonValue | undefined>,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(buildJsonHeaders());
  const csrfToken = await ensureClientCsrfToken();
  if (csrfToken) {
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  return fetch(path, {
    method,
    credentials: "include",
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });
}
