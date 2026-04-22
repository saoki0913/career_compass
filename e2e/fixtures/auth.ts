/**
 * E2E Test Authentication Helpers
 *
 * Provides utilities for testing authenticated flows
 */

import { APIResponse, Page, expect } from "@playwright/test";
import { ensureCiE2EAuthSession } from "../google-auth";

// Legacy device token key kept for cleanup checks in E2E.
const DEVICE_TOKEN_KEY = "ukarun_device_token";
const GUEST_COOKIE_NAME = "guest_device_token";
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getResponseStatus(response: { status: number | (() => number) }) {
  return typeof response.status === "function" ? response.status() : response.status;
}

/**
 * Generate a random UUID for device token
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Login as a guest user by issuing the server-managed guest cookie.
 */
export async function loginAsGuest(page: Page): Promise<string> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";

  await page.goto("/");
  const csrfToken = await ensureCsrfToken(page, baseURL);
  if (!csrfToken) {
    throw new Error("Failed to obtain CSRF token before guest login");
  }
  const response = await page.context().request.fetch(`${baseURL}/api/auth/guest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseURL,
      Referer: `${baseURL}/`,
      [CSRF_HEADER_NAME]: csrfToken,
    },
    data: JSON.stringify({}),
  });
  if (!response.ok()) {
    throw new Error(`Failed to login as guest: ${response.status()}`);
  }

  await ensureCsrfToken(page, baseURL);
  const guestToken = await getCookieValue(page, baseURL, GUEST_COOKIE_NAME);
  if (!guestToken) {
    throw new Error("Guest session cookie was not issued");
  }

  return guestToken;
}

/**
 * Clear guest session by removing device token
 */
export async function clearGuestSession(page: Page): Promise<void> {
  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000");
  await page.context().addCookies([
    {
      name: GUEST_COOKIE_NAME,
      value: "",
      domain: baseURL.hostname,
      path: "/",
      expires: 0,
      httpOnly: true,
      sameSite: "Lax",
      secure: baseURL.protocol === "https:",
    },
    {
      name: CSRF_COOKIE_NAME,
      value: "",
      domain: baseURL.hostname,
      path: "/",
      expires: 0,
      httpOnly: false,
      sameSite: "Strict",
      secure: baseURL.protocol === "https:",
    },
  ]);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, DEVICE_TOKEN_KEY);
}

/**
 * Check if device token exists in localStorage
 */
export async function hasDeviceToken(page: Page): Promise<boolean> {
  return (await getDeviceToken(page)) !== null;
}

/**
 * Get the current device token from localStorage
 */
export async function getDeviceToken(page: Page): Promise<string | null> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  return getCookieValue(page, baseURL, GUEST_COOKIE_NAME);
}

export async function ensureGuestSession(page: Page): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const url = `${baseURL}/api/auth/guest`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const csrfToken = await ensureCsrfToken(page, baseURL);
    if (!csrfToken) {
      throw new Error("Failed to obtain CSRF token before guest session bootstrap");
    }
    const response = await page.context().request.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseURL,
        Referer: `${baseURL}/`,
        [CSRF_HEADER_NAME]: csrfToken,
      },
      data: JSON.stringify({}),
    });
    lastStatus = response.status();
    if (response.ok()) {
      await ensureCsrfToken(page, baseURL);
      return;
    }
    if (lastStatus >= 500 && attempt < 3) {
      await page.waitForTimeout(800 * (attempt + 1));
      continue;
    }
    throw new Error(`Failed to bootstrap guest session: ${lastStatus}`);
  }
}

async function getCookieValue(
  page: Page,
  baseURL: string,
  name: string,
): Promise<string | null> {
  const cookies = (await page.context().cookies(baseURL)) ?? [];
  return cookies.find((cookie) => cookie.name === name)?.value ?? null;
}

function buildCookieHeader(
  cookies: Array<{ name: string; value: string }>,
): string | null {
  const pairs = cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  return pairs.length > 0 ? pairs.join("; ") : null;
}

function filterCookiesForRequest(
  cookies: Array<{ name: string; value: string }>,
  includeGuestToken: boolean,
) {
  if (includeGuestToken) {
    return cookies;
  }
  return cookies.filter((cookie) => cookie.name !== GUEST_COOKIE_NAME);
}

async function ensureCsrfToken(page: Page, baseURL: string): Promise<string | null> {
  const existingToken = await getCookieValue(page, baseURL, CSRF_COOKIE_NAME);
  if (existingToken) {
    return existingToken;
  }

  await page.context().request.fetch(`${baseURL}/api/csrf`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return getCookieValue(page, baseURL, CSRF_COOKIE_NAME);
}

/**
 * Mock authenticated user session
 * This intercepts auth API calls and returns a mock session
 */
function getE2eMockSessionCookieSpec() {
  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000");
  const secure = baseURL.protocol === "https:";
  const names = secure
    ? ["__Secure-better-auth.session_token", "better-auth.session_token"]
    : ["better-auth.session_token"];
  return { baseURL, names };
}

export async function mockAuthenticatedUser(
  page: Page,
  user: {
    id: string;
    name: string;
    email: string;
    plan?: "free" | "standard" | "pro";
  }
): Promise<void> {
  // Mock the session endpoint
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: null,
          plan: user.plan || "free",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: {
          id: generateUUID(),
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    });
  });

  const { baseURL, names } = getE2eMockSessionCookieSpec();
  const secure = baseURL.protocol === "https:";
  const hostname = baseURL.hostname;
  await page.context().addCookies(
    names.map((name) => ({
      name,
      value: "e2e-mock-session",
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
      ...(secure ? { secure: true } : {}),
    })),
  );
}

export async function mockCredits(
  page: Page,
  payload: {
    type?: "user" | "guest";
    plan?: "guest" | "free" | "standard" | "pro";
    balance: number;
    monthlyAllocation?: number;
    nextResetAt?: string | null;
    dailyFreeCompanyFetchRemaining?: number;
    dailyFreeCompanyFetchLimit?: number;
    /** 選考スケジュール月次無料（`monthlyFree.selectionSchedule`） */
    monthlySelectionScheduleRemaining?: number;
    monthlySelectionScheduleLimit?: number;
    monthlyFreeCompanyRagRemaining?: number;
    monthlyFreeCompanyRagLimit?: number;
  },
): Promise<void> {
  const selectionRemaining =
    payload.monthlySelectionScheduleRemaining ?? payload.dailyFreeCompanyFetchRemaining ?? 5;
  const selectionLimit =
    payload.monthlySelectionScheduleLimit ?? payload.dailyFreeCompanyFetchLimit ?? 5;
  await page.route("**/api/credits", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: payload.type ?? "user",
        plan: payload.plan ?? "free",
        balance: payload.balance,
        monthlyAllocation: payload.monthlyAllocation ?? payload.balance,
        nextResetAt: payload.nextResetAt ?? null,
        monthlyFree: {
          companyRagPages: {
            remaining: payload.monthlyFreeCompanyRagRemaining ?? 10,
            limit: payload.monthlyFreeCompanyRagLimit ?? 10,
          },
          selectionSchedule: {
            remaining: selectionRemaining,
            limit: selectionLimit,
          },
        },
      }),
    });
  });
}

/**
 * Mock unauthenticated state
 */
export async function mockUnauthenticated(page: Page): Promise<void> {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(null),
    });
  });
}

/**
 * Wait after navigation. `networkidle` は dev サーバの HMR・並列ワーカー・長寿命接続で
 * タイムアウトしやすいため使わない。
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("load").catch(() => {});
}

/**
 * Navigate and wait for load
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForPageLoad(page);
}

/**
 * Setup guest session and navigate to a page
 */
export async function setupGuestAndNavigate(
  page: Page,
  path: string
): Promise<string> {
  const token = await loginAsGuest(page);
  await navigateTo(page, path);
  return token;
}

/**
 * Verify redirect to login page
 */
export async function expectRedirectToLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Verify redirect to pricing page
 */
export async function expectRedirectToPricing(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/pricing/);
}

/**
 * Verify redirect to dashboard
 */
export async function expectRedirectToDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Get x-device-token header value for API requests
 */
export async function getDeviceTokenHeader(
  page: Page
): Promise<Record<string, string>> {
  const token = await getDeviceToken(page);
  if (token) {
    return { "x-device-token": token };
  }
  return {};
}

async function buildApiRequestHeaders(
  page: Page,
  baseURL: string,
  includeGuestToken: boolean,
  method: string,
) {
  let cookies = (await page.context().cookies(baseURL)) ?? [];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (includeGuestToken) {
    const token = cookies.find((cookie) => cookie.name === GUEST_COOKIE_NAME)?.value ?? null;
    if (token) {
      headers["x-device-token"] = token;
    }
  }

  if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    let csrfToken = cookies.find((cookie) => cookie.name === CSRF_COOKIE_NAME)?.value ?? null;
    if (!csrfToken) {
      csrfToken = await ensureCsrfToken(page, baseURL);
      cookies = (await page.context().cookies(baseURL)) ?? [];
    }
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const cookieHeader = buildCookieHeader(filterCookiesForRequest(cookies, includeGuestToken));
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

/**
 * Make an authenticated API request as guest
 */
export async function apiRequest(
  page: Page,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const headers = await buildApiRequestHeaders(page, baseURL, true, method);
  headers.Origin = baseURL;
  headers.Referer = `${baseURL}/`;

  return await page.context().request.fetch(`${baseURL}${endpoint}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiRequestAsAuthenticatedUser(
  page: Page,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  if (process.env.CI_E2E_AUTH_SECRET?.trim()) {
    await ensureCiE2EAuthSession(page);
  }
  const headers = await buildApiRequestHeaders(page, baseURL, false, method);
  headers.Origin = baseURL;
  headers.Referer = `${baseURL}/`;

  let response = await page.context().request.fetch(`${baseURL}${endpoint}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
  if (getResponseStatus(response) === 401 && process.env.CI_E2E_AUTH_SECRET?.trim()) {
    await ensureCiE2EAuthSession(page);
    const retryHeaders = await buildApiRequestHeaders(page, baseURL, false, method);
    retryHeaders.Origin = baseURL;
    retryHeaders.Referer = `${baseURL}/`;
    response = await page.context().request.fetch(`${baseURL}${endpoint}`, {
      method,
      headers: retryHeaders,
      data: body ? JSON.stringify(body) : undefined,
    });
  }
  return response;
}

export async function expectOkResponse(
  response: APIResponse,
  label: string,
): Promise<string> {
  const body = await response.text().catch(() => "");
  expect(
    response.ok(),
    `${label} failed with ${response.status()} ${response.statusText()}\n${body.slice(0, 1200)}`,
  ).toBeTruthy();
  return body;
}

export async function createGuestCompany(
  page: Page,
  input: {
    name: string;
    industry?: string;
    recruitmentUrl?: string;
    corporateUrl?: string;
    notes?: string;
    status?: string;
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequest(page, "POST", "/api/companies", input);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create company: ${response.status()}\n${body.slice(0, 1200)}`);
  }
  const payload = (await response.json()) as { company: { id: string; name: string } };
  return payload.company;
}

export async function createOwnedCompany(
  page: Page,
  input: {
    name: string;
    industry?: string;
    recruitmentUrl?: string;
    corporateUrl?: string;
    notes?: string;
    status?: string;
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", "/api/companies", input);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create owned company: ${response.status()}\n${body.slice(0, 1200)}`);
  }
  const payload = (await response.json()) as { company: { id: string; name: string } };
  return payload.company;
}

export async function deleteGuestCompany(page: Page, companyId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/companies/${companyId}`);
}

export async function deleteOwnedCompany(page: Page, companyId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/companies/${companyId}`);
}

export async function createGuestDocument(
  page: Page,
  input: {
    title: string;
    type: "es" | "tips" | "company_analysis";
    companyId?: string;
    content?: Array<Record<string, unknown>>;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequest(page, "POST", "/api/documents", input);
  if (!response.ok()) {
    throw new Error(`Failed to create document: ${response.status()}`);
  }
  const payload = (await response.json()) as { document: { id: string; title: string } };
  return payload.document;
}

export async function deleteGuestDocument(page: Page, documentId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/documents/${documentId}`);
}

export async function createOwnedDocument(
  page: Page,
  input: {
    title: string;
    type: "es" | "tips" | "company_analysis";
    companyId?: string;
    content?: Array<Record<string, unknown>>;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", "/api/documents", input);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create owned document: ${response.status()}\n${body.slice(0, 1200)}`);
  }
  const payload = (await response.json()) as { document: { id: string; title: string } };
  return payload.document;
}

export async function deleteOwnedDocument(page: Page, documentId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/documents/${documentId}`);
}

export async function createOwnedDeadline(
  page: Page,
  companyId: string,
  input: {
    type: string;
    title: string;
    dueDate: string;
    description?: string;
    memo?: string;
    sourceUrl?: string;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", `/api/companies/${companyId}/deadlines`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create owned deadline: ${response.status()}`);
  }
  const payload = (await response.json()) as { deadline: { id: string; title: string } };
  return payload.deadline;
}

export async function createGuestDeadline(
  page: Page,
  companyId: string,
  input: {
    type: string;
    title: string;
    dueDate: string;
    description?: string;
    memo?: string;
    sourceUrl?: string;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequest(page, "POST", `/api/companies/${companyId}/deadlines`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create guest deadline: ${response.status()}`);
  }
  const payload = (await response.json()) as { deadline: { id: string; title: string } };
  return payload.deadline;
}

export async function deleteOwnedDeadline(page: Page, deadlineId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/deadlines/${deadlineId}`);
}

export async function deleteGuestDeadline(page: Page, deadlineId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/deadlines/${deadlineId}`);
}

export async function createOwnedApplication(
  page: Page,
  companyId: string,
  input: {
    name: string;
    type: "summer_intern" | "fall_intern" | "winter_intern" | "early" | "main" | "other";
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", `/api/companies/${companyId}/applications`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create owned application: ${response.status()}`);
  }
  const payload = (await response.json()) as { application: { id: string; name: string } };
  return payload.application;
}

export async function createGuestApplication(
  page: Page,
  companyId: string,
  input: {
    name: string;
    type: "summer_intern" | "fall_intern" | "winter_intern" | "early" | "main" | "other";
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequest(page, "POST", `/api/companies/${companyId}/applications`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create guest application: ${response.status()}`);
  }
  const payload = (await response.json()) as { application: { id: string; name: string } };
  return payload.application;
}

export async function deleteOwnedApplication(page: Page, applicationId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/applications/${applicationId}`);
}

export async function deleteGuestApplication(page: Page, applicationId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/applications/${applicationId}`);
}

export async function createOwnedSubmission(
  page: Page,
  applicationId: string,
  input: {
    type: string;
    name: string;
    isRequired?: boolean;
    notes?: string;
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", `/api/applications/${applicationId}/submissions`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create owned submission: ${response.status()}`);
  }
  const payload = (await response.json()) as { submission: { id: string; name: string } };
  return payload.submission;
}

export async function createGuestSubmission(
  page: Page,
  applicationId: string,
  input: {
    type: string;
    name: string;
    isRequired?: boolean;
    notes?: string;
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequest(page, "POST", `/api/applications/${applicationId}/submissions`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create guest submission: ${response.status()}`);
  }
  const payload = (await response.json()) as { submission: { id: string; name: string } };
  return payload.submission;
}

export async function deleteOwnedSubmission(page: Page, submissionId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/submissions/${submissionId}`);
}

export async function deleteGuestSubmission(page: Page, submissionId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/submissions/${submissionId}`);
}

export async function createOwnedTask(
  page: Page,
  input: {
    title: string;
    type: "es" | "web_test" | "self_analysis" | "gakuchika" | "video" | "other";
    description?: string;
    companyId?: string;
    applicationId?: string;
    deadlineId?: string;
    dueDate?: string;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", "/api/tasks", input);
  if (!response.ok()) {
    throw new Error(`Failed to create owned task: ${response.status()}`);
  }
  const payload = (await response.json()) as { task: { id: string; title: string } };
  return payload.task;
}

export async function createGuestTask(
  page: Page,
  input: {
    title: string;
    type: "es" | "web_test" | "self_analysis" | "gakuchika" | "video" | "other";
    description?: string;
    companyId?: string;
    applicationId?: string;
    deadlineId?: string;
    dueDate?: string;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequest(page, "POST", "/api/tasks", input);
  if (!response.ok()) {
    throw new Error(`Failed to create guest task: ${response.status()}`);
  }
  const payload = (await response.json()) as { task: { id: string; title: string } };
  return payload.task;
}

export async function deleteOwnedTask(page: Page, taskId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/tasks/${taskId}`);
}

export async function deleteGuestTask(page: Page, taskId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/tasks/${taskId}`);
}

export async function createOwnedGakuchika(
  page: Page,
  input: {
    title: string;
    content: string;
    charLimitType: "300" | "400" | "500";
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", "/api/gakuchika", input);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create owned gakuchika: ${response.status()}\n${body.slice(0, 1200)}`);
  }
  const payload = (await response.json()) as { gakuchika: { id: string; title: string } };
  return payload.gakuchika;
}

export async function createGuestGakuchika(
  page: Page,
  input: {
    title: string;
    content: string;
    charLimitType: "300" | "400" | "500";
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequest(page, "POST", "/api/gakuchika", input);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create guest gakuchika: ${response.status()}\n${body.slice(0, 1200)}`);
  }
  const payload = (await response.json()) as { gakuchika: { id: string; title: string } };
  return payload.gakuchika;
}

export async function deleteOwnedGakuchika(page: Page, gakuchikaId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/gakuchika/${gakuchikaId}`);
}

export async function deleteGuestGakuchika(page: Page, gakuchikaId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/gakuchika/${gakuchikaId}`);
}

export async function createOwnedNotification(
  page: Page,
  input: {
    type:
      | "deadline_reminder"
      | "deadline_near"
      | "company_fetch"
      | "es_review"
      | "daily_summary"
      | "calendar_sync_failed";
    title: string;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", "/api/notifications", input);
  if (!response.ok()) {
    throw new Error(`Failed to create owned notification: ${response.status()}`);
  }
  const payload = (await response.json()) as { notification: { id: string; title: string } };
  return payload.notification;
}

export async function createGuestNotification(
  page: Page,
  input: {
    type:
      | "deadline_reminder"
      | "deadline_near"
      | "company_fetch"
      | "es_review"
      | "daily_summary"
      | "calendar_sync_failed";
    title: string;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; title: string }> {
  const response = await apiRequest(page, "POST", "/api/notifications", input);
  if (!response.ok()) {
    throw new Error(`Failed to create guest notification: ${response.status()}`);
  }
  const payload = (await response.json()) as { notification: { id: string; title: string } };
  return payload.notification;
}

export async function deleteOwnedNotification(page: Page, notificationId: string): Promise<void> {
  await apiRequestAsAuthenticatedUser(page, "DELETE", `/api/notifications/${notificationId}`);
}

export async function deleteGuestNotification(page: Page, notificationId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/notifications/${notificationId}`);
}
