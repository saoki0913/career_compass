import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ASSETS,
  FAVICON_ASSETS,
  LOGO_ASSETS,
  LP_SECTION_ASSET_BASE,
  LP_SECTION_ASSETS,
  lpSectionAsset,
} from "./image-registry";

const publicDir = path.join(process.cwd(), "public");

function assertFileExists(publicPath: string, label: string) {
  const filePath = path.join(publicDir, publicPath);
  expect(existsSync(filePath), `${label}: public${publicPath}`).toBe(true);
}

describe("image-registry", () => {
  it("all favicon assets exist on disk", () => {
    for (const [key, val] of Object.entries(FAVICON_ASSETS)) {
      assertFileExists(val, `FAVICON_ASSETS.${key}`);
    }
  });

  it("all logo assets exist on disk", () => {
    for (const [key, val] of Object.entries(LOGO_ASSETS)) {
      assertFileExists(val, `LOGO_ASSETS.${key}`);
    }
  });

  it("all dashboard assets exist on disk", () => {
    for (const [key, val] of Object.entries(DASHBOARD_ASSETS)) {
      assertFileExists(val, `DASHBOARD_ASSETS.${key}`);
    }
  });

  it("all LP section assets exist on disk", () => {
    for (const [section, assets] of Object.entries(LP_SECTION_ASSETS)) {
      for (const [key, relativePath] of Object.entries(
        assets as Record<string, string>,
      )) {
        assertFileExists(
          `${LP_SECTION_ASSET_BASE}/${relativePath}`,
          `LP.${section}.${key}`,
        );
      }
    }
  });

  it("lpSectionAsset builds correct absolute path", () => {
    const result = lpSectionAsset(LP_SECTION_ASSETS.hero.iconStar);
    expect(result).toBe("/marketing/LP/sections/hero/icon-star.png");
  });
});
