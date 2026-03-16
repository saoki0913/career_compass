import { expect, type Page } from "@playwright/test";

export const hasGoogleAuthState = Boolean(process.env.PLAYWRIGHT_AUTH_STATE);

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
