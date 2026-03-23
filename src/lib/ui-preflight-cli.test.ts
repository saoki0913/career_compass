import { describe, expect, it } from "vitest";
import {
  buildUiPreflightReviewCommand,
  formatUiPreflightMarkdown,
  getUiPreflightQuestions,
  parseUiPreflightArgs,
} from "./ui-preflight-cli.mjs";

describe("parseUiPreflightArgs", () => {
  it("parses a route, auth mode, and surface", () => {
    expect(
      parseUiPreflightArgs(["/pricing", "--surface=marketing", "--auth=none"])
    ).toEqual({
      authMode: "none",
      routePath: "/pricing",
      surface: "marketing",
    });
  });

  it("defaults auth mode to none", () => {
    expect(parseUiPreflightArgs(["/dashboard", "--surface=product"])).toEqual({
      authMode: "none",
      routePath: "/dashboard",
      surface: "product",
    });
  });

  it("rejects missing routes", () => {
    expect(() => parseUiPreflightArgs(["--surface=marketing"])).toThrow(/Usage:/);
  });

  it("rejects invalid surfaces", () => {
    expect(() => parseUiPreflightArgs(["/pricing", "--surface=public"])).toThrow(
      /surface must be one of/
    );
  });

  it("rejects invalid auth modes", () => {
    expect(() => parseUiPreflightArgs(["/pricing", "--surface=marketing", "--auth=user"])).toThrow(
      /auth must be one of/
    );
  });
});

describe("getUiPreflightQuestions", () => {
  it("adapts the content plan prompt by surface", () => {
    expect(getUiPreflightQuestions("marketing")[1]?.prompt).toMatch(/Hero \/ support/);
    expect(getUiPreflightQuestions("product")[1]?.prompt).toMatch(/workspace \/ status/);
  });
});

describe("buildUiPreflightReviewCommand", () => {
  it("includes guest auth when needed", () => {
    expect(
      buildUiPreflightReviewCommand({
        authMode: "guest",
        routePath: "/companies",
      })
    ).toBe("npm run test:ui:review -- /companies --auth=guest");
  });
});

describe("formatUiPreflightMarkdown", () => {
  const answers = {
    visualThesis: "Calm, credible, student-first workspace with soft density.",
    contentPlan: "workspace -> status -> key task -> next action",
    interactionThesis: "Header fade-in; cardless section reveal; CTA hover emphasis.",
    designTokens: "background slate-50, surface white, primary text slate-900, muted text slate-600, accent primary.",
    desktopFirstView: "Show page title, progress summary, and one clear primary action.",
    mobileFirstView: "Show title, current status, and the next action without overlap.",
    existingConstraints: "Preserve current navigation, button style, and spacing rhythm.",
  };

  it("renders a markdown block with required sections", () => {
    const markdown = formatUiPreflightMarkdown({
      authMode: "guest",
      routePath: "/dashboard",
      surface: "product",
      answers,
    });

    expect(markdown).toContain("## UI Preflight");
    expect(markdown).toContain("### visual thesis");
    expect(markdown).toContain("### hard rules reminder");
    expect(markdown).toContain("`npm run test:ui:review -- /dashboard --auth=guest`");
  });

  it("rejects empty required answers", () => {
    expect(() =>
      formatUiPreflightMarkdown({
        authMode: "none",
        routePath: "/pricing",
        surface: "marketing",
        answers: {
          ...answers,
          visualThesis: "",
        },
      })
    ).toThrow(/visual thesis is required/);
  });
});
