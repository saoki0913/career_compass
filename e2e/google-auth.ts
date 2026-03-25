import { expect, type Page } from "@playwright/test";

const ciE2EAuthSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
export const hasGoogleAuthState = Boolean(process.env.PLAYWRIGHT_AUTH_STATE);
export const hasCiE2EAuth = Boolean(ciE2EAuthSecret);
export const hasAuthenticatedUserAccess = hasCiE2EAuth || hasGoogleAuthState;

async function signInWithCiE2EAuth(page: Page) {
  if (!ciE2EAuthSecret) {
    throw new Error("Missing CI_E2E_AUTH_SECRET");
  }

  const response = await page.context().request.post("/api/internal/test-auth/login", {
    headers: {
      Authorization: `Bearer ${ciE2EAuthSecret}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`CI E2E auth failed with status ${response.status()}`);
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
    await signInWithCiE2EAuth(page);
    await page.goto(expectedPath, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname.startsWith(expectedPath), {
      timeout: 30000,
    });
    await expect(page).toHaveURL(new RegExp(expectedPath));
    return;
  }

  await signInWithGoogle(page, expectedPath);
}
