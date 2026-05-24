import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("ListPageFilterBar regressions", () => {
  it("does not keep separate mobile and desktop layout branches", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");

    expect(source).not.toContain("sm:hidden");
    expect(source).not.toContain("hidden items-center gap-3 sm:flex");
    expect(source).not.toContain("grid gap-2 sm:hidden");
  });

  it("keeps controls in a mobile grid and desktop scroll row without duplicate branches", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");

    expect(source).toContain("FILTER_BAR_SCROLL_ROW_CLASS");
    expect(source).toContain("flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto");
    expect(source).toContain("const hasStatusRow = filterTabs.length > 0 || activeFilters.length > 0");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(source).toContain("grid w-full min-w-0 grid-cols-2 gap-2 lg:flex");
    expect(source).toContain("relative col-span-2 min-w-0 lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem]");
    expect(source).toContain('density = "default"');
    expect(source).toContain('density?: "default" | "tasks"');
    expect(source).toContain('variant?: "default" | "companies" | "search" | "es"');
    expect(source).toContain("filterTabs.map");
    expect(source).toContain("activeFilters.map");
    expect(source).toContain("aria-pressed={isActive}");
    expect(source).toContain("{statusControls}");
    expect(source).toContain('<div className="min-w-0 space-y-2">');
    expect(source).not.toContain("if (isEs)");
    expect(source).not.toContain("mt-3 flex flex-wrap gap-2");
    expect(source).not.toContain("overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]");
  });

  it("keeps the skeleton aligned to the responsive filter bar", () => {
    const source = readSource("src/components/shared/ListPageFilterBarSkeleton.tsx");

    expect(source).not.toContain("sm:hidden");
    expect(source).not.toContain("hidden h-9 shrink-0 rounded-xl sm:block");
    expect(source).toContain("SKELETON_SCROLL_ROW_CLASS");
    expect(source).toContain("flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto");
    expect(source).toContain("SKELETON_CONTROL_ROW_CLASS");
    expect(source).toContain("grid w-full min-w-0 grid-cols-2 gap-2 lg:flex");
    expect(source).toContain("lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem]");
    expect(source).toContain("min-w-0 space-y-2");
    expect(source).not.toContain("actionSlots");
  });
});
