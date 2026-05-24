import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBarSkeleton.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBarSkeleton", () => {
  it("mirrors the mobile stacked filter controls", async () => {
    const source = await readSource();
    expect(source).toContain('variant: "es" | "companies" | "gakuchika" | "tasks" | "deadlines" | "search"');
    expect(source).toContain("col-span-2 h-[52px] w-full rounded-[1.1rem] lg:h-9");
    expect(source).toContain("grid w-full min-w-0 grid-cols-2 gap-2 lg:flex");
    expect(source).toContain("lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem]");
    expect(source).toContain("SKELETON_CONTROL_ROW_CLASS");
    expect(source).toContain('const extraFilterSlots = variant === "es" ? 2 : hasExtraFilter ? 1 : 0');
  });
});
