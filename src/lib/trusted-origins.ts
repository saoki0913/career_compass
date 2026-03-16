import { getAppOrigin } from "@/lib/app-url";

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function normalizeOrigin(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function parseOriginList(value?: string): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => normalizeOrigin(String(entry)))
          .filter((entry): entry is string => Boolean(entry));
      }
    } catch {
      return [];
    }
  }

  return trimmed
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function getTrustedOrigins(): string[] {
  const origins = new Set<string>(parseOriginList(process.env.BETTER_AUTH_TRUSTED_ORIGINS));

  origins.add(getAppOrigin());

  if (process.env.NODE_ENV !== "production") {
    for (const origin of LOCAL_DEV_ORIGINS) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function getTrustedOriginSet(): Set<string> {
  return new Set(getTrustedOrigins());
}
