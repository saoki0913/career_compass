import { describe, expect, it } from "vitest";
import {
  buildUiReviewEnv,
  parseUiReviewArgs,
  slugifyUiReviewPath,
} from "./ui-review-cli.mjs";

describe("parseUiReviewArgs", () => {
  it("parses route paths and auth mode", () => {
    expect(parseUiReviewArgs(["/dashboard", "/companies", "--auth=guest"])).toEqual({
      authMode: "guest",
      paths: ["/dashboard", "/companies"],
    });
  });

  it("defaults auth mode to none", () => {
    expect(parseUiReviewArgs(["/"])).toEqual({
      authMode: "none",
      paths: ["/"],
    });
  });

  it("rejects missing routes", () => {
    expect(() => parseUiReviewArgs([])).toThrow(/Usage:/);
  });

  it("rejects unknown auth modes", () => {
    expect(() => parseUiReviewArgs(["/dashboard", "--auth=user"])).toThrow(
      /auth must be one of/
    );
  });
});

describe("buildUiReviewEnv", () => {
  it("builds Playwright env vars", () => {
    expect(
      buildUiReviewEnv({
        authMode: "guest",
        paths: ["/dashboard", "/companies"],
      })
    ).toEqual({
      PLAYWRIGHT_UI_AUTH_MODE: "guest",
      PLAYWRIGHT_UI_PATHS: "/dashboard,/companies",
    });
  });
});

describe("slugifyUiReviewPath", () => {
  it("creates stable file slugs from routes", () => {
    expect(slugifyUiReviewPath("/")).toBe("home");
    expect(slugifyUiReviewPath("/companies/new")).toBe("companies-new");
    expect(slugifyUiReviewPath("/companies/[id]/motivation")).toBe(
      "companies-id-motivation"
    );
  });
});
