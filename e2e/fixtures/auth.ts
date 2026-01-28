/**
 * E2E Test Authentication Helpers
 *
 * Provides utilities for testing authenticated flows
 */

import { Page, BrowserContext, expect } from "@playwright/test";

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
 * Verify redirect to plan selection
 */
export async function expectRedirectToPlanSelection(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/plan-selection/);
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

  return await page.request.fetch(`http://localhost:3000${endpoint}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
}
