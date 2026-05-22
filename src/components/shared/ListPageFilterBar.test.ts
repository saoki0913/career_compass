import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBar.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBar", () => {
  it("uses compact h-10 controls on mobile (no oversized h-12)", async () => {
    const source = await readSource();
    // companies variant の検索/Select もモバイルから h-10 に統一する
    expect(source).toContain('isCompanies ? "h-10 w-full rounded-xl md:w-[165px] lg:w-[210px]"');
    expect(source).not.toContain("h-12 md:h-10");
  });

  it("shrinks the tasks padding and status tabs on mobile", async () => {
    const source = await readSource();
    expect(source).toContain("p-3 sm:p-4 xl:p-5");
    // 状態タブはモバイルで詰めて sm 以上で従来サイズに戻す
    expect(source).toContain("text-[13px]");
    expect(source).toContain("sm:px-4 sm:py-2");
  });

  it("preserves accessible search and tab handlers", async () => {
    const source = await readSource();
    expect(source).toContain("aria-label={searchPlaceholder}");
    expect(source).toContain("onClick={() => onFilterChange?.(tab.key)}");
  });
});
