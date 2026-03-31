import { expect, type Page } from "@playwright/test";
import { getBetterAuthSessionCookieCandidates } from "../src/lib/auth/ci-e2e";
import { buildCiE2EAuthFailureMessage } from "../src/lib/testing/ci-e2e-auth";

const ciE2EAuthSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
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
      .filter(
        (cookie): cookie is NonNullable<ReturnType<typeof parseSetCookieHeader>> =>
          Boolean(cookie) && sessionProbe.cookieCandidates.includes(cookie.name),
      );

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
