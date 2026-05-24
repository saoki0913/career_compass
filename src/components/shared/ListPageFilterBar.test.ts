import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBar.tsx", import.meta.url), "utf8");
}

async function readLayoutSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./list-page-filter-bar-layout.ts", import.meta.url), "utf8");
}

describe("ListPageFilterBar", () => {
  it("uses large mobile search controls and compact desktop controls", async () => {
    const source = await readLayoutSource();
    expect(source).toContain("h-[56px]");
    expect(source).toContain("lg:h-8");
    expect(source).toContain("FILTER_BAR_SELECT_TRIGGER_CLASS");
    expect(source).toContain('export type FilterBarVariant = "default" | "companies" | "search" | "es"');
  });

  it("shrinks the tasks padding and status tabs on mobile", async () => {
    const source = await readSource();
    const layout = await readLayoutSource();
    expect(layout).toContain("FILTER_BAR_SURFACE_CLASS");
    expect(source).toContain('density === "tasks" && "sm:p-4 lg:px-2 lg:py-1.5"');
    expect(layout).toContain("FILTER_BAR_STATUS_TAB_CLASS");
    expect(layout).toContain("lg:max-w-[4.9rem]");
  });

  it("preserves accessible search and tab handlers", async () => {
    const source = await readSource();
    expect(source).toContain("aria-label={searchPlaceholder}");
    expect(source).toContain("onClick={() => onFilterChange?.(tab.key)}");
    expect(source).toContain("aria-pressed={isActive}");
  });

  it("keeps status tabs in the shared responsive layout contract", async () => {
    const source = await readSource();
    const layout = await readLayoutSource();
    expect(source).not.toContain("if (isEs)");
    expect(source).toContain("{statusControls}");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(layout).toContain("lg:flex lg:flex-nowrap");
    expect(layout).toContain("lg:overflow-visible");
    expect(layout).toContain("FILTER_BAR_INNER_CLASS");
  });
});
