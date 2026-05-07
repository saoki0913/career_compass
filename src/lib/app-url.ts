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

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL must be configured in production");
  }

  return DEFAULT_APP_URL;
}

export function getAppOrigin(): string {
  return new URL(getAppUrl()).origin;
}

export function getClientAuthBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return getAppUrl();
}
