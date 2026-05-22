import { describe, expect, it } from "vitest";
import {
  buildScreenshotCaptureEnv,
  normalizeScreenshotCaptureFilter,
  parseScreenshotCaptureArgs,
} from "./screenshot-capture-cli.mjs";

describe("parseScreenshotCaptureArgs", () => {
  it("defaults to all routes and three viewports", () => {
    expect(parseScreenshotCaptureArgs([])).toEqual({
      atomic: true,
      baseUrl: "http://localhost:3000",
      filters: [],
      groups: [],
      authInteractive: false,
      headed: false,
      outputDir: "public/screenshots/generated",
      viewports: ["mobile", "tablet", "desktop"],
    });
  });

  it("parses route filters, headed mode, viewport filter, and output directory", () => {
    expect(
      parseScreenshotCaptureArgs([
        "/dashboard",
        "marketing.pricing",
        "--headed",
        "--auth-interactive",
        "--no-atomic",
        "--base-url=http://127.0.0.1:3001/",
        "--group=marketing",
        "--viewport=mobile,desktop",
        "--output-dir=public/screenshots/generated/smoke",
      ]),
    ).toEqual({
      atomic: false,
      baseUrl: "http://127.0.0.1:3001",
      filters: ["/dashboard", "marketing.pricing"],
      groups: ["marketing"],
      authInteractive: true,
      headed: true,
      outputDir: "public/screenshots/generated/smoke",
      viewports: ["mobile", "desktop"],
    });
  });

  it("normalizes route path filters", () => {
    expect(normalizeScreenshotCaptureFilter("/dashboard/?tab=all")).toBe("/dashboard?tab=all");
    expect(normalizeScreenshotCaptureFilter("/pricing?checkout=canceled&source=standard")).toBe(
      "/pricing?checkout=canceled&source=standard",
    );
  });

  it("deduplicates repeated filters", () => {
    expect(parseScreenshotCaptureArgs(["/dashboard", "/dashboard"]).filters).toEqual(["/dashboard"]);
  });

  it("parses and deduplicates screenshot groups", () => {
    expect(parseScreenshotCaptureArgs(["--group=marketing,marketing"]).groups).toEqual(["marketing"]);
  });

  it("rejects invalid viewports and options", () => {
    expect(() => parseScreenshotCaptureArgs(["--viewport=watch"])).toThrow(/viewport/u);
    expect(() => parseScreenshotCaptureArgs(["--group=unknown"])).toThrow(/group/u);
    expect(() => parseScreenshotCaptureArgs(["--auth=real"])).toThrow(/Unknown option/u);
    expect(() => parseScreenshotCaptureArgs(["--base-url=not-url"])).toThrow(/base URL/u);
    expect(() => parseScreenshotCaptureArgs(["--base-url=https://stg.shupass.jp"])).toThrow(/local http URL/u);
    expect(() => parseScreenshotCaptureArgs(["//example.com/dashboard"])).toThrow(/route path or route id/u);
  });

  it("rejects public output directories outside the generated screenshot root", () => {
    expect(() => parseScreenshotCaptureArgs(["--output-dir=public/screenshots/generated-smoke"])).toThrow(
      /public\/screenshots\/generated/u,
    );
    expect(() =>
      parseScreenshotCaptureArgs([`--output-dir=${process.cwd()}/public/screenshots/generated-smoke`]),
    ).toThrow(/public\/screenshots\/generated/u);
  });

  it("rejects repo-local output directories outside the generated screenshot root", () => {
    expect(() => parseScreenshotCaptureArgs(["--output-dir=docs/screenshots"])).toThrow(
      /public\/screenshots\/generated/u,
    );
  });

  it("requires atomic output to stay inside the generated screenshot root", () => {
    expect(() => parseScreenshotCaptureArgs(["--output-dir=/private/tmp/screenshots"])).toThrow(
      /Atomic screenshot capture output/u,
    );
    expect(parseScreenshotCaptureArgs(["--no-atomic", "--output-dir=/private/tmp/screenshots"]).outputDir).toBe(
      "/private/tmp/screenshots",
    );
  });
});

describe("buildScreenshotCaptureEnv", () => {
  it("builds Playwright env vars", () => {
    expect(
      buildScreenshotCaptureEnv({
        baseUrl: "http://localhost:3000",
        filters: ["/dashboard"],
        groups: ["marketing"],
        headed: true,
        outputDir: "public/screenshots/generated",
        viewports: ["desktop"],
      }),
    ).toEqual({
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_FILTERS: "/dashboard",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_GROUPS: "marketing",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_HEADED: "1",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_OUTPUT_DIR: "public/screenshots/generated",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_VIEWPORTS: "desktop",
    });
  });
});
