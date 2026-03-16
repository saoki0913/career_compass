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
  return (
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.BETTER_AUTH_URL) ||
    DEFAULT_APP_URL
  );
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
