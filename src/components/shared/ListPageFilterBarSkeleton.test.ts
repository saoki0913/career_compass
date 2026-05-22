import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBarSkeleton.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBarSkeleton", () => {
  it("mirrors the compact h-10 filter controls (no oversized h-12)", async () => {
    const source = await readSource();
    // 実画面 ListPageFilterBar の h-10 統一に追従し、companies の h-12 を排除する
    expect(source).not.toContain("h-12 w-full rounded-xl md:h-10");
    expect(source).toContain("h-10 w-full rounded-xl md:w-[14rem]");
  });
});
