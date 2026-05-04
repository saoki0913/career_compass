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

  it("keeps controls and tabs in responsive scroll rows without layout forks", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");

    expect(source).toContain("FILTER_BAR_SCROLL_ROW_CLASS");
    expect(source).toContain("flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto");
    expect(source).toContain("const hasStatusRow = filterTabs.length > 0 || activeFilters.length > 0");
    expect(source).toContain("relative min-w-[14rem] max-w-[22rem] flex-[1_0_16rem]");
    expect(source).toContain("filterTabs.map");
    expect(source).toContain("activeFilters.map");
    expect(source).not.toContain("mt-3 flex flex-wrap gap-2");
    expect(source).not.toContain("overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]");
  });

  it("keeps the skeleton aligned to the responsive filter bar", () => {
    const source = readSource("src/components/shared/ListPageFilterBarSkeleton.tsx");

    expect(source).not.toContain("sm:hidden");
    expect(source).not.toContain("hidden h-9 shrink-0 rounded-xl sm:block");
    expect(source).toContain("SKELETON_SCROLL_ROW_CLASS");
    expect(source).toContain("flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto");
    expect(source).toContain("space-y-2");
    expect(source).not.toContain("actionSlots");
  });
});
