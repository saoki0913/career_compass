import { expect, type Page } from "@playwright/test";
import { getBetterAuthSessionCookieCandidates } from "../src/lib/auth/ci-e2e";

const ciE2EAuthSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
const ciE2EScope = process.env.CI_E2E_SCOPE?.trim();
export const hasGoogleAuthState = Boolean(process.env.PLAYWRIGHT_AUTH_STATE);
export const hasCiE2EAuth = Boolean(ciE2EAuthSecret);
export const hasAuthenticatedUserAccess = hasCiE2EAuth || hasGoogleAuthState;
const DEFAULT_BASE_URL = "http://localhost:3000";

function normalizeResponseSnippet(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function parseErrorCode(rawBody: string) {
  if (!rawBody) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawBody) as
      | { error?: { code?: string }; code?: string }
      | null;
    return parsed?.error?.code || parsed?.code || "";
  } catch {
    return "";
  }
}

function buildCiE2EAuthFailureMessage(input: {
  status: number;
  errorCode?: string | null;
  endpoint: string;
  requestId?: string | null;
  responseSnippet?: string | null;
}) {
  const errorCode = String(input.errorCode || "").trim();
  const parts: string[] = [];

  if (input.status === 404 && errorCode === "CI_TEST_AUTH_DISABLED") {
    parts.push(
      "CI E2E auth is disabled on staging. Check CI_E2E_AUTH_SECRET, BETTER_AUTH_SECRET, CI_E2E_AUTH_ENABLED, NEXT_PUBLIC_APP_URL, and BETTER_AUTH_URL.",
    );
  } else if (input.status === 404) {
    parts.push("CI E2E auth route is missing or the deployment is serving a node without the route enabled.");
  } else if (input.status === 401) {
    parts.push("CI E2E auth secret was rejected by the staging route.");
  } else if (input.status >= 500) {
    parts.push("CI E2E auth route returned an upstream/server error.");
  } else {
    parts.push("CI E2E auth route returned an unexpected response.");
  }

  parts.push(`status=${input.status}`);
  if (errorCode) {
    parts.push(`code=${errorCode}`);
  }
  parts.push(`endpoint=${input.endpoint}`);
  if (input.requestId) {
    parts.push(`requestId=${input.requestId}`);
  }
  if (input.responseSnippet) {
    parts.push(`response=${input.responseSnippet}`);
  }

  return parts.join(" | ");
}

function getBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function parseSetCookieHeader(setCookieValue: string, baseUrl: URL) {
  const [nameValue, ...attributeParts] = setCookieValue.split(";").map((part) => part.trim());
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  let domain = baseUrl.hostname;
  let path = "/";
  let httpOnly = false;
  let secure = baseUrl.protocol === "https:";
  let sameSite: "Strict" | "Lax" | "None" = "Lax";
  let expires: number | undefined;

  for (const attribute of attributeParts) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const rawValue = rawValueParts.join("=").trim();
    if (key === "domain" && rawValue) {
      domain = rawValue.replace(/^\./, "");
    } else if (key === "path" && rawValue) {
      path = rawValue;
    } else if (key === "httponly") {
      httpOnly = true;
    } else if (key === "secure") {
      secure = true;
    } else if (key === "samesite" && rawValue) {
      const normalized = rawValue.toLowerCase();
      if (normalized === "strict") {
        sameSite = "Strict";
      } else if (normalized === "none") {
        sameSite = "None";
      } else {
        sameSite = "Lax";
      }
    } else if (key === "max-age" && rawValue) {
      const maxAge = Number(rawValue);
      if (Number.isFinite(maxAge)) {
        expires = Math.floor(Date.now() / 1000) + maxAge;
      }
    } else if (key === "expires" && rawValue) {
      const parsed = Date.parse(rawValue);
      if (!Number.isNaN(parsed)) {
        expires = Math.floor(parsed / 1000);
      }
    }
  }

  return {
    name: nameValue.slice(0, separatorIndex),
    value: nameValue.slice(separatorIndex + 1),
    domain,
    path,
    httpOnly,
    secure,
    sameSite,
    ...(expires ? { expires } : {}),
  };
}

async function probeCiE2ESession(page: Page) {
  const baseUrl = getBaseUrl();
  const cookieCandidates = getBetterAuthSessionCookieCandidates(baseUrl);
  const cookies = await page.context().cookies(baseUrl);
  const matchedCookies = cookies.filter((cookie) => cookieCandidates.includes(cookie.name));
  const sessionResponse = await page.context().request.get(`${baseUrl}/api/auth/get-session`);
  const rawBody = await sessionResponse.text().catch(() => "");

  let sessionUserId = "";
  try {
    const parsed = JSON.parse(rawBody) as { user?: { id?: string } } | null;
    sessionUserId = parsed?.user?.id || "";
  } catch {
    sessionUserId = "";
  }

  return {
    baseUrl,
    cookieCandidates,
    cookieNames: cookies.map((cookie) => cookie.name),
    hasSessionCookie: matchedCookies.length > 0,
    sessionStatus: sessionResponse.status(),
    sessionUserId,
    sessionSnippet: normalizeResponseSnippet(rawBody),
  };
}

function buildCiE2ESessionFailureMessage(input: {
  baseUrl: string;
  cookieCandidates: string[];
  cookieNames: string[];
  sessionStatus: number;
  sessionUserId: string;
  sessionSnippet: string;
}) {
  const parts = [
    "CI E2E auth login succeeded but the browser context is not authenticated.",
    `baseUrl=${input.baseUrl}`,
    `expectedCookies=${input.cookieCandidates.join(",")}`,
    `presentCookies=${input.cookieNames.join(",") || "(none)"}`,
    `sessionStatus=${input.sessionStatus}`,
  ];
  if (input.sessionUserId) {
    parts.push(`sessionUserId=${input.sessionUserId}`);
  }
  if (input.sessionSnippet) {
    parts.push(`session=${input.sessionSnippet}`);
  }
  return parts.join(" | ");
}

export async function ensureCiE2EAuthSession(page: Page) {
  if (!ciE2EAuthSecret) {
    throw new Error("Missing CI_E2E_AUTH_SECRET");
  }

  const baseUrl = getBaseUrl();
  const response = await page.context().request.post(`${baseUrl}/api/internal/test-auth/login`, {
    headers: {
      Authorization: `Bearer ${ciE2EAuthSecret}`,
      ...(ciE2EScope ? { "x-ci-e2e-scope": ciE2EScope } : {}),
    },
  });

  if (!response.ok()) {
    const rawBody = await response.text();
    const requestId = response.headers()["x-request-id"] || "";
    throw new Error(
      buildCiE2EAuthFailureMessage({
        status: response.status(),
        errorCode: parseErrorCode(rawBody),
        endpoint: response.url(),
        requestId,
        responseSnippet: normalizeResponseSnippet(rawBody),
      })
    );
  }

  let sessionProbe = await probeCiE2ESession(page);
  if (!sessionProbe.hasSessionCookie || !sessionProbe.sessionUserId) {
    const parsedCookies = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => parseSetCookieHeader(header.value, new URL(baseUrl)))
      .filter((cookie): cookie is NonNullable<ReturnType<typeof parseSetCookieHeader>> => {
        if (!cookie) {
          return false;
        }
        return sessionProbe.cookieCandidates.includes(cookie.name);
      });

    if (parsedCookies.length > 0) {
      await page.context().addCookies(parsedCookies);
      sessionProbe = await probeCiE2ESession(page);
    }
  }

  if (!sessionProbe.hasSessionCookie || !sessionProbe.sessionUserId) {
    throw new Error(buildCiE2ESessionFailureMessage(sessionProbe));
  }
}

export async function signInWithGoogle(page: Page, expectedPath: string) {
  if (!hasGoogleAuthState) {
    throw new Error("Missing PLAYWRIGHT_AUTH_STATE");
  }

  await page.goto(expectedPath, { waitUntil: "networkidle" });
  await page.waitForURL((url) => url.pathname.startsWith(expectedPath), {
    timeout: 30000,
  });
  await expect(page).toHaveURL(new RegExp(expectedPath));
}

export async function signInAsAuthenticatedUser(page: Page, expectedPath: string) {
  if (hasCiE2EAuth) {
    await ensureCiE2EAuthSession(page);
    await page.goto(expectedPath, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname.startsWith(expectedPath), {
      timeout: 30000,
    });
    await expect(page).toHaveURL(new RegExp(expectedPath));
    return;
  }

  await signInWithGoogle(page, expectedPath);
}
