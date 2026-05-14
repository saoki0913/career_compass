import { getAppUrl } from "@/lib/app-url";

const PRODUCTION_HOSTS = new Set(["www.shupass.jp", "shupass.jp"]);
const DEFAULT_ALLOWED_TEST_AUTH_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "stg.shupass.jp"]);
const DEFAULT_COOKIE_NAME = "better-auth.session_token";
const SECURE_COOKIE_NAME = "__Secure-better-auth.session_token";
const MIN_TEST_AUTH_SECRET_LENGTH = 16;
const PRODUCTION_DB_HOST_PATTERNS = [
  /\.supabase\.com$/i,
  /\.pooler\.supabase\.com$/i,
  /\.aws-.*\.pooler\.supabase\.com$/i,
];

function parseAppUrl(appUrl: string) {
  try {
    return new URL(appUrl);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export function isProductionAppUrl(appUrl = getAppUrl()) {
  return PRODUCTION_HOSTS.has(parseAppUrl(appUrl).hostname);
}

export function isProductionLikeCiE2EEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV === "production") {
    return true;
  }
  if (env.NODE_ENV === "production" && env.CI_E2E_AUTH_ENABLED !== "1") {
    return true;
  }
  if ((env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")) {
    return true;
  }
  return pointsToProductionDatabase(env.DATABASE_URL);
}

function getAllowedTestAuthHosts() {
  const configuredHosts = (process.env.CI_E2E_AUTH_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_TEST_AUTH_HOSTS, ...configuredHosts]);
}

export function isCiE2EAuthHostAllowed(appUrl = getAppUrl()) {
  const hostname = parseAppUrl(appUrl).hostname.toLowerCase();
  return getAllowedTestAuthHosts().has(hostname);
}

export function hasValidCiE2EAuthSecret(secret = process.env.CI_E2E_AUTH_SECRET) {
  return (secret?.trim().length ?? 0) >= MIN_TEST_AUTH_SECRET_LENGTH;
}

export function isSecureBetterAuthCookie(appUrl = getAppUrl()) {
  return parseAppUrl(appUrl).protocol === "https:";
}

export function getBetterAuthSessionCookieName(appUrl = getAppUrl()) {
  return isSecureBetterAuthCookie(appUrl) ? SECURE_COOKIE_NAME : DEFAULT_COOKIE_NAME;
}

export function getBetterAuthSessionCookieCandidates(appUrl = getAppUrl()) {
  const primary = getBetterAuthSessionCookieName(appUrl);
  return primary === DEFAULT_COOKIE_NAME ? [DEFAULT_COOKIE_NAME] : [primary, DEFAULT_COOKIE_NAME];
}

export function getBetterAuthSessionCookieAttributes(appUrl = getAppUrl()) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureBetterAuthCookie(appUrl),
  };
}

export function isCiE2EAuthEnabled(appUrl = getAppUrl()) {
  if (isProductionLikeCiE2EEnvironment()) {
    return false;
  }

  if (isProductionAppUrl(appUrl)) {
    return false;
  }

  if (!isCiE2EAuthHostAllowed(appUrl)) {
    return false;
  }

  return process.env.CI_E2E_AUTH_ENABLED === "1" && hasValidCiE2EAuthSecret();
}

function pointsToProductionDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) return false;
  try {
    const hostname = new URL(databaseUrl).hostname;
    return PRODUCTION_DB_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
