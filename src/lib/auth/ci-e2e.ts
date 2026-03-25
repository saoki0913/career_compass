import { getAppUrl } from "@/lib/app-url";

const PRODUCTION_HOSTS = new Set(["www.shupass.jp", "shupass.jp"]);
const DEFAULT_COOKIE_NAME = "better-auth.session_token";
const SECURE_COOKIE_NAME = "__Secure-better-auth.session_token";

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
  return process.env.CI_E2E_AUTH_ENABLED === "1" && !isProductionAppUrl(appUrl);
}
