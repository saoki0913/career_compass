import { test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const screenshotDir = path.join(
  process.cwd(),
  "test-results",
  "lp-variants",
);

const variants = ["A", "B", "C"] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const variant of variants) {
  for (const vp of viewports) {
    test(`LP variant ${variant} - ${vp.name}`, async ({ page }) => {
      test.setTimeout(120_000);

      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto(`/?_lp_variant=${variant}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // Wait for page to finish loading
      await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});

      // Wait for animations to settle
      await page.waitForTimeout(3_000);

      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({
        fullPage: true,
        path: path.join(
          screenshotDir,
          `variant-${variant}-${vp.name}.png`,
        ),
      });
    });
  }
}
