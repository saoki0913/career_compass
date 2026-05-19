import { isDeployedAppEnvironment, resolveAppEnvironment } from "@/env/deployment";
import { getAppOrigin } from "@/lib/app-url";

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const PRODUCTION_ORIGINS = [
  "https://www.shupass.jp",
  "https://shupass.jp",
];

function isStrictOriginValidationEnabled() {
  return isDeployedAppEnvironment();
}

function isProductionDeployment() {
  return resolveAppEnvironment() === "production";
}

function isStagingDeployment() {
  return resolveAppEnvironment() === "staging";
}

export function normalizeOrigin(value?: string | null): string | null {
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

function parseRawOriginEntries(value?: string): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS JSON value must be an array.");
    }
    return parsed.map((entry) => String(entry));
  }

  return trimmed.split(",");
}

function isLocalhostOrigin(origin: string) {
  const { hostname, protocol } = new URL(origin);
  return (
    protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
}

export function parseTrustedOriginList(value?: string, options: { strict?: boolean } = {}): string[] {
  const entries = parseRawOriginEntries(value);
  const origins: string[] = [];
  const invalidEntries: string[] = [];

  for (const entry of entries) {
    const origin = normalizeOrigin(entry);
    if (!origin) {
      invalidEntries.push(entry.trim() || "(empty)");
      continue;
    }
    origins.push(origin);
  }

  if (options.strict && invalidEntries.length > 0) {
    throw new Error(`Invalid BETTER_AUTH_TRUSTED_ORIGINS entries: ${invalidEntries.join(", ")}`);
  }

  return origins;
}

function assertTrustedOriginsAreSafe(origins: Set<string>) {
  if (origins.size === 0) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must be configured in deployed environments.");
  }

  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && !isLocalhostOrigin(origin)) {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must use HTTPS outside local development.");
    }
    if (isLocalhostOrigin(origin)) {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must not include localhost in deployed environments.");
    }
  }

  if (isProductionDeployment()) {
    for (const origin of PRODUCTION_ORIGINS) {
      if (!origins.has(origin)) {
        throw new Error(`BETTER_AUTH_TRUSTED_ORIGINS must include ${origin} in production.`);
      }
    }
  } else if (isStagingDeployment() && !origins.has("https://stg.shupass.jp")) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must include https://stg.shupass.jp in staging.");
  }
}

export function getTrustedOrigins(value = process.env.BETTER_AUTH_TRUSTED_ORIGINS): string[] {
  const strict = isStrictOriginValidationEnabled();
  const configuredOrigins = parseTrustedOriginList(value, { strict });
  if (strict && configuredOrigins.length === 0) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must be configured in deployed environments.");
  }

  const origins = new Set<string>(configuredOrigins);

  origins.add(getAppOrigin());

  if (!strict) {
    for (const origin of LOCAL_DEV_ORIGINS) {
      origins.add(origin);
    }
  }

  if (strict) {
    assertTrustedOriginsAreSafe(origins);
  }

  return [...origins];
}

export function getTrustedOriginSet(): Set<string> {
  return new Set(getTrustedOrigins());
}
