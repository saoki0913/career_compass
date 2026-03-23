import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ensureGuestSession, loginAsGuest } from "./fixtures/auth";
import { parseUiReviewPaths, slugifyUiReviewPath } from "../src/lib/ui-review-cli.mjs";

const authMode = process.env.PLAYWRIGHT_UI_AUTH_MODE?.trim() || "none";
const reviewPaths = parseUiReviewPaths(process.env.PLAYWRIGHT_UI_PATHS);
const screenshotDir = path.join(process.cwd(), "test-results", "ui-review");

const viewports = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 844, name: "mobile", width: 390 },
] as const;

async function prepareAuthForRoute(page: Parameters<typeof test>[0]["page"]) {
  if (authMode !== "guest") {
    return;
  }

  await loginAsGuest(page);
  await ensureGuestSession(page);
}

for (const routePath of reviewPaths) {
  for (const viewport of viewports) {
    test(`ui review ${viewport.name} ${routePath}`, async ({ page }) => {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await prepareAuthForRoute(page);

      await page.goto(routePath, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      expect(new URL(page.url()).pathname).toBe(routePath);

      const main = page.locator("main");
      if ((await main.count()) > 0) {
        await expect(main.first()).toBeVisible();
      } else {
        await expect(page.locator("body")).toBeVisible();
      }

      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({
        fullPage: true,
        path: path.join(
          screenshotDir,
          `${slugifyUiReviewPath(routePath)}-${viewport.name}.png`
        ),
      });
    });
  }
}
