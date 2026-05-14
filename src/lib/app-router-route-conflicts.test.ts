import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { appRouteDefinitions } from "@/lib/routes/app-routes";

const repoRoot = process.cwd();
const appRoot = path.join(repoRoot, "src/app");
const pageFilePattern = /^page\.(?:t|j)sx?$/;

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectPageFiles(absolutePath);
    }
    if (entry.isFile() && pageFilePattern.test(entry.name)) {
      return [absolutePath];
    }
    return [];
  });
}

function normalizeDynamicSegment(segment: string): string {
  if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) {
    return "[[...param]]";
  }
  if (/^\[\.\.\.[^\]]+\]$/.test(segment)) {
    return "[...param]";
  }
  if (/^\[[^\]]+\]$/.test(segment)) {
    return "[param]";
  }
  return segment;
}

function resolveAppPath(pageFile: string): string {
  const relativePath = path.relative(appRoot, pageFile);
  const routeSegments = relativePath
    .split(path.sep)
    .slice(0, -1)
    .filter((segment) => {
      if (segment.startsWith("(") && segment.endsWith(")")) return false;
      if (segment.startsWith("@")) return false;
      if (segment.startsWith("_")) return false;
      return true;
    })
    .map(normalizeDynamicSegment);

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

describe("App Router route ownership", () => {
  it("does not define multiple pages that resolve to the same pathname", () => {
    const filesByRoute = new Map<string, string[]>();

    for (const pageFile of collectPageFiles(appRoot)) {
      const routePath = resolveAppPath(pageFile);
      const relativeFile = path.relative(repoRoot, pageFile);
      filesByRoute.set(routePath, [...(filesByRoute.get(routePath) ?? []), relativeFile]);
    }

    const duplicates = [...filesByRoute.entries()].filter(([, files]) => files.length > 1);

    expect(duplicates).toEqual([]);
  });

  it("keeps registered route pages unique and present", () => {
    const paths = appRouteDefinitions.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);

    for (const route of appRouteDefinitions) {
      expect(existsSync(path.join(repoRoot, route.page))).toBe(true);
    }
  });

  it("registers /pricing as a public marketing route", () => {
    expect(appRouteDefinitions).toContainEqual({
      id: "marketing.pricing",
      path: "/pricing",
      owner: "marketing",
      surface: "public",
      page: "src/app/(marketing)/pricing/page.tsx",
      sitemap: true,
    });
  });

  it("registers canonical profile and settings product routes", () => {
    expect(appRouteDefinitions).toContainEqual({
      id: "product.profile",
      path: "/profile",
      owner: "product",
      surface: "product",
      page: "src/app/(product)/profile/page.tsx",
      sitemap: false,
    });
    expect(appRouteDefinitions).toContainEqual({
      id: "product.settings",
      path: "/settings",
      owner: "product",
      surface: "product",
      page: "src/app/(product)/settings/page.tsx",
      sitemap: false,
    });
  });
});
