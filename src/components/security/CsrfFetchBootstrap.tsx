"use client";

import { useEffect } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  if (input instanceof URL) {
    return input;
  }

  if (typeof input === "string") {
    return new URL(input, window.location.origin);
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return new URL(input.url, window.location.origin);
  }

  return null;
}

export function CsrfFetchBootstrap() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let csrfInitPromise: Promise<string | null> | null = null;

    const ensureCsrfToken = async () => {
      const existingToken = readCookie(CSRF_COOKIE_NAME);
      if (existingToken) {
        return existingToken;
      }

      if (!csrfInitPromise) {
        csrfInitPromise = originalFetch("/api/csrf", {
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
    };

    void ensureCsrfToken();

    window.fetch = async (input, init) => {
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (!STATE_CHANGING_METHODS.has(method)) {
        return originalFetch(input, init);
      }

      const targetUrl = resolveUrl(input);
      if (!targetUrl || targetUrl.origin !== window.location.origin) {
        return originalFetch(input, init);
      }

      const token = readCookie(CSRF_COOKIE_NAME) ?? (await ensureCsrfToken());
      if (!token) {
        return originalFetch(input, init);
      }

      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      if (!headers.has(CSRF_HEADER_NAME)) {
        headers.set(CSRF_HEADER_NAME, token);
      }

      if (input instanceof Request) {
        return originalFetch(new Request(input, { ...init, headers }));
      }

      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
