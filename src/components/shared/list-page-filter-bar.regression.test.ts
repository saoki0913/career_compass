import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("ListPageFilterBar regressions", () => {
  it("keeps layout decisions in a shared contract used by the bar and skeleton", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");
    const skeleton = readSource("src/components/shared/ListPageFilterBarSkeleton.tsx");
    const layout = readSource("src/components/shared/list-page-filter-bar-layout.ts");

    expect(source).toContain("resolveFilterBarLayoutKey");
    expect(skeleton).toContain("resolveSkeletonFilterBarLayoutKey");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(skeleton).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(layout).toContain("FILTER_BAR_SKELETON_PROFILES");
  });

  it("does not keep separate mobile and desktop layout branches", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");

    expect(source).not.toContain("sm:hidden");
    expect(source).not.toContain("hidden items-center gap-3 sm:flex");
    expect(source).not.toContain("grid gap-2 sm:hidden");
  });

  it("keeps controls in a mobile grid and desktop scroll row without duplicate branches", () => {
    const source = readSource("src/components/shared/ListPageFilterBar.tsx");

    expect(source).toContain("FILTER_BAR_STATUS_ROW_CLASS");
    expect(source).toContain("const hasStatusRow = filterTabs.length > 0 || activeFilters.length > 0");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(source).toContain("resolveFilterBarLayoutKey");
    expect(source).toContain('density = "default"');
    expect(source).toContain("type FilterBarDensity");
    expect(source).toContain("type FilterBarVariant");
    expect(source).toContain("filterTabs.map");
    expect(source).toContain("activeFilters.map");
    expect(source).toContain("aria-pressed={isActive}");
    expect(source).toContain("{statusControls}");
    expect(source).toContain("FILTER_BAR_INNER_CLASS");
    expect(source).not.toContain("if (isEs)");
    expect(source).not.toContain("mt-3 flex flex-wrap gap-2");
    expect(source).not.toContain("overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]");
  });

  it("keeps desktop filter bars on one non-scrolling row", () => {
    const layout = readSource("src/components/shared/list-page-filter-bar-layout.ts");

    expect(layout).toContain("lg:flex lg:flex-nowrap");
    expect(layout).toContain("lg:overflow-visible");
    expect(layout).toContain("lg:[scrollbar-width:none]");
    expect(layout).toContain("FILTER_BAR_ACTIVE_FILTER_SUMMARY_CLASS");
  });

  it("keeps the skeleton aligned to the responsive filter bar", () => {
    const source = readSource("src/components/shared/ListPageFilterBarSkeleton.tsx");

    expect(source).not.toContain("sm:hidden");
    expect(source).not.toContain("hidden h-9 shrink-0 rounded-xl sm:block");
    expect(source).toContain("FILTER_BAR_STATUS_ROW_CLASS");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(source).toContain("FILTER_BAR_SEARCH_CLASS");
    expect(source).toContain("FILTER_BAR_INNER_CLASS");
    expect(source).not.toContain("actionSlots");
  });
});
