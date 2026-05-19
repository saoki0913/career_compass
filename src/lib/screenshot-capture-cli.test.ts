import { describe, expect, it } from "vitest";
import {
  buildScreenshotCaptureEnv,
  normalizeScreenshotCaptureFilter,
  parseScreenshotCaptureArgs,
} from "./screenshot-capture-cli.mjs";

describe("parseScreenshotCaptureArgs", () => {
  it("defaults to all routes and three viewports", () => {
    expect(parseScreenshotCaptureArgs([])).toEqual({
      filters: [],
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
        "--viewport=mobile,desktop",
        "--output-dir=public/screenshots/generated/smoke",
      ]),
    ).toEqual({
      filters: ["/dashboard", "marketing.pricing"],
      authInteractive: true,
      headed: true,
      outputDir: "public/screenshots/generated/smoke",
      viewports: ["mobile", "desktop"],
    });
  });

  it("normalizes route path filters", () => {
    expect(normalizeScreenshotCaptureFilter("/dashboard/?tab=all")).toBe("/dashboard");
  });

  it("deduplicates repeated filters", () => {
    expect(parseScreenshotCaptureArgs(["/dashboard", "/dashboard"]).filters).toEqual(["/dashboard"]);
  });

  it("rejects invalid viewports and options", () => {
    expect(() => parseScreenshotCaptureArgs(["--viewport=watch"])).toThrow(/viewport/u);
    expect(() => parseScreenshotCaptureArgs(["--auth=real"])).toThrow(/Unknown option/u);
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
});

describe("buildScreenshotCaptureEnv", () => {
  it("builds Playwright env vars", () => {
    expect(
      buildScreenshotCaptureEnv({
        filters: ["/dashboard"],
        headed: true,
        outputDir: "public/screenshots/generated",
        viewports: ["desktop"],
      }),
    ).toEqual({
      PLAYWRIGHT_SCREENSHOT_CAPTURE_FILTERS: "/dashboard",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_HEADED: "1",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_OUTPUT_DIR: "public/screenshots/generated",
      PLAYWRIGHT_SCREENSHOT_CAPTURE_VIEWPORTS: "desktop",
    });
  });
});
