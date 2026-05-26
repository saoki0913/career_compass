import { resolveAppEnvironment } from "@/env/deployment";

const DEFAULT_APP_URL = "http://localhost:3000";

function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUrl(value?: string | null): string | undefined {
  const raw = clean(value);
  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function getAppUrl(): string {
  const configuredUrl =
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.BETTER_AUTH_URL);

  if (configuredUrl) {
    return configuredUrl;
  }

  if (resolveAppEnvironment() !== "local") {
    throw new Error("NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL must be configured in production");
  }

  return DEFAULT_APP_URL;
}

export function getAppOrigin(): string {
  return new URL(getAppUrl()).origin;
}

export function getClientAuthBaseUrl(): string {
  const configuredUrl =
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.BETTER_AUTH_URL);

  if (typeof window !== "undefined") {
    const currentOrigin = window.location.origin;
    if (currentOrigin.startsWith("http://localhost") || currentOrigin.startsWith("http://127.0.0.1")) {
      return currentOrigin;
    }
    return configuredUrl ?? currentOrigin;
  }

  return configuredUrl ?? getAppUrl();
}
