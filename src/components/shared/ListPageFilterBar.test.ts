import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBar.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBar", () => {
  it("uses large mobile search controls and compact desktop controls", async () => {
    const source = await readSource();
    expect(source).toContain("h-[52px] lg:h-9");
    expect(source).toContain('"h-12 min-w-0 shrink-0 rounded-xl lg:h-9"');
    expect(source).toContain('variant?: "default" | "companies" | "search" | "es"');
  });

  it("shrinks the tasks padding and status tabs on mobile", async () => {
    const source = await readSource();
    expect(source).toContain('"rounded-[1.1rem] border border-slate-200/80 bg-white/92 p-3');
    expect(source).toContain('density === "tasks" && "sm:p-4 xl:p-5"');
    expect(source).toContain("text-[13px]");
    expect(source).toContain("lg:h-8 lg:px-3 lg:text-xs");
  });

  it("preserves accessible search and tab handlers", async () => {
    const source = await readSource();
    expect(source).toContain("aria-label={searchPlaceholder}");
    expect(source).toContain("onClick={() => onFilterChange?.(tab.key)}");
    expect(source).toContain("aria-pressed={isActive}");
  });

  it("keeps status tabs in a separate responsive row", async () => {
    const source = await readSource();
    expect(source).not.toContain("if (isEs)");
    expect(source).toContain("{statusControls}");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(source).toContain("lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem]");
    expect(source).toContain('<div className="min-w-0 space-y-2">');
  });
});
