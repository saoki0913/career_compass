import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { screenshotCaptureRoutes } from "./screenshot-capture-routes";
import { screenshotCaptureScenarios } from "../../e2e/tooling/screenshot-capture-scenarios";

const repoRoot = process.cwd();
const appRoot = path.join(repoRoot, "src/app");
const pageFilePattern = /^page\.(?:t|j)sx?$/u;

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectPageFiles(absolutePath);
    }
    if (entry.isFile() && pageFilePattern.test(entry.name)) {
      return [path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/")];
    }
    return [];
  });
}

function derivePathTemplate(pageFile: string): string {
  const relativePath = pageFile.replace(/^src\/app\//u, "");
  const routeSegments = relativePath
    .split("/")
    .slice(0, -1)
    .filter((segment) => {
      if (segment.startsWith("(") && segment.endsWith(")")) return false;
      if (segment.startsWith("@")) return false;
      if (segment.startsWith("_")) return false;
      return true;
    });

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

describe("screenshotCaptureRoutes", () => {
  it("registers every App Router page file exactly once", () => {
    const registeredPages = screenshotCaptureRoutes.map((route) => route.page).sort();
    expect(registeredPages).toEqual(collectPageFiles(appRoot).sort());
  });

  it("keeps ids, path templates, and output folders unique", () => {
    const ids = screenshotCaptureRoutes.map((route) => route.id);
    const templates = screenshotCaptureRoutes.map((route) => route.pathTemplate);
    const outputFolders = screenshotCaptureRoutes.map((route) => `${route.outputGroup}/${route.id}`);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(templates).size).toBe(templates.length);
    expect(new Set(outputFolders).size).toBe(outputFolders.length);
  });

  it("keeps path templates aligned with page files", () => {
    for (const route of screenshotCaptureRoutes) {
      expect(existsSync(path.join(repoRoot, route.page))).toBe(true);
      expect(route.pathTemplate).toBe(derivePathTemplate(route.page));
    }
  });

  it("requires real auth and dynamic data for dynamic product screens", () => {
    const dynamicRoutes = screenshotCaptureRoutes.filter((route) => "dynamicParams" in route);
    expect(dynamicRoutes.map((route) => route.pathTemplate).sort()).toEqual([
      "/companies/[id]",
      "/companies/[id]/interview",
      "/companies/[id]/motivation",
      "/es/[id]",
      "/gakuchika/[id]",
    ]);
    expect(dynamicRoutes.every((route) => route.authMode === "real")).toBe(true);
  });

  it("marks auth-required screens as real auth captures", () => {
    expect(screenshotCaptureRoutes.find((route) => route.pathTemplate === "/onboarding")?.authMode).toBe("real");
    expect(screenshotCaptureRoutes.find((route) => route.pathTemplate === "/login")?.authMode).toBe("none");
  });

  it("declares intentional redirect captures explicitly", () => {
    expect(screenshotCaptureRoutes.find((route) => route.pathTemplate === "/waitlist")).toMatchObject({
      expectedFinalPath: "/login",
    });
  });
});

describe("screenshotCaptureScenarios", () => {
  it("keeps ids and output folders unique across state captures", () => {
    const ids = screenshotCaptureScenarios.map((route) => route.id);
    const outputFolders = screenshotCaptureScenarios.map((route) => `${route.outputGroup}/${route.id}`);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(outputFolders).size).toBe(outputFolders.length);
  });

  it("keeps marketing group captures isolated by output group", () => {
    const marketingScenarios = screenshotCaptureScenarios.filter((route) => route.outputGroup === "marketing");

    expect(marketingScenarios).toHaveLength(23);
    expect(marketingScenarios.every((route) => route.id.startsWith("marketing."))).toBe(true);
  });
});
