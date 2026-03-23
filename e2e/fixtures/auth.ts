/**
 * E2E Test Authentication Helpers
 *
 * Provides utilities for testing authenticated flows
 */

import { APIResponse, Page, expect } from "@playwright/test";

// Device token key used by the app
const DEVICE_TOKEN_KEY = "ukarun_device_token";

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
 * Login as a guest user by setting device token in localStorage
 */
export async function loginAsGuest(page: Page): Promise<string> {
  const deviceToken = generateUUID();

  // Navigate to a page first to set localStorage
  await page.goto("/");

  // Set the device token in localStorage
  await page.evaluate(
    ({ key, token }) => {
      localStorage.setItem(key, token);
    },
    { key: DEVICE_TOKEN_KEY, token: deviceToken }
  );

  return deviceToken;
}

/**
 * Clear guest session by removing device token
 */
export async function clearGuestSession(page: Page): Promise<void> {
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, DEVICE_TOKEN_KEY);
}

/**
 * Check if device token exists in localStorage
 */
export async function hasDeviceToken(page: Page): Promise<boolean> {
  return await page.evaluate((key) => {
    return localStorage.getItem(key) !== null;
  }, DEVICE_TOKEN_KEY);
}

/**
 * Get the current device token from localStorage
 */
export async function getDeviceToken(page: Page): Promise<string | null> {
  return await page.evaluate((key) => {
    return localStorage.getItem(key);
  }, DEVICE_TOKEN_KEY);
}

export async function ensureGuestSession(page: Page): Promise<void> {
  const token = await getDeviceToken(page);
  if (!token) {
    throw new Error("Guest device token is not set");
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  const response = await page.request.post(`${baseURL}/api/auth/guest`, {
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      deviceToken: token,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to bootstrap guest session: ${response.status()}`);
  }
}

/**
 * Mock authenticated user session
 * This intercepts auth API calls and returns a mock session
 */
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
 * Wait for the page to be fully loaded after navigation
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * Navigate and wait for load
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
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

/**
 * Make an authenticated API request as guest
 */
export async function apiRequest(
  page: Page,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
) {
  const token = await getDeviceToken(page);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["x-device-token"] = token;
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";

  return await page.request.fetch(`${baseURL}${endpoint}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
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
    throw new Error(`Failed to create company: ${response.status()}`);
  }
  const payload = (await response.json()) as { company: { id: string; name: string } };
  return payload.company;
}

export const createOwnedCompany = createGuestCompany;

export async function deleteGuestCompany(page: Page, companyId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/companies/${companyId}`);
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
  const response = await apiRequest(page, "POST", `/api/companies/${companyId}/deadlines`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create deadline: ${response.status()}`);
  }
  const payload = (await response.json()) as { deadline: { id: string; title: string } };
  return payload.deadline;
}

export async function createOwnedApplication(
  page: Page,
  companyId: string,
  input: {
    name: string;
    type: "summer_intern" | "fall_intern" | "winter_intern" | "early" | "main" | "other";
  },
): Promise<{ id: string; name: string }> {
  const response = await apiRequest(page, "POST", `/api/companies/${companyId}/applications`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create application: ${response.status()}`);
  }
  const payload = (await response.json()) as { application: { id: string; name: string } };
  return payload.application;
}

export async function deleteOwnedApplication(page: Page, applicationId: string): Promise<void> {
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
  const response = await apiRequest(page, "POST", `/api/applications/${applicationId}/submissions`, input);
  if (!response.ok()) {
    throw new Error(`Failed to create submission: ${response.status()}`);
  }
  const payload = (await response.json()) as { submission: { id: string; name: string } };
  return payload.submission;
}

export async function deleteOwnedSubmission(page: Page, submissionId: string): Promise<void> {
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
  const response = await apiRequest(page, "POST", "/api/tasks", input);
  if (!response.ok()) {
    throw new Error(`Failed to create task: ${response.status()}`);
  }
  const payload = (await response.json()) as { task: { id: string; title: string } };
  return payload.task;
}

export async function deleteOwnedTask(page: Page, taskId: string): Promise<void> {
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
  const response = await apiRequest(page, "POST", "/api/gakuchika", input);
  if (!response.ok()) {
    throw new Error(`Failed to create gakuchika: ${response.status()}`);
  }
  const payload = (await response.json()) as { gakuchika: { id: string; title: string } };
  return payload.gakuchika;
}

export async function deleteOwnedGakuchika(page: Page, gakuchikaId: string): Promise<void> {
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
  const response = await apiRequest(page, "POST", "/api/notifications", input);
  if (!response.ok()) {
    throw new Error(`Failed to create notification: ${response.status()}`);
  }
  const payload = (await response.json()) as { notification: { id: string; title: string } };
  return payload.notification;
}

export async function deleteOwnedNotification(page: Page, notificationId: string): Promise<void> {
  await apiRequest(page, "DELETE", `/api/notifications/${notificationId}`);
}

export async function waitForRouteProgress(page: Page): Promise<void> {
  await expect(page.locator('div[aria-hidden="false"] .route-progress-bar').first()).toBeVisible();
}
