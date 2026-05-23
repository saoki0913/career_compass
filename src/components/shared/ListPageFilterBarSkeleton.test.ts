import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBarSkeleton.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBarSkeleton", () => {
  it("mirrors the mobile stacked filter controls", async () => {
    const source = await readSource();
    expect(source).toContain('variant: "es" | "companies" | "gakuchika" | "tasks" | "deadlines" | "search"');
    expect(source).toContain("col-span-2 h-[52px] w-full rounded-[1.1rem] md:h-9");
    expect(source).toContain("grid w-full min-w-0 grid-cols-2 gap-2 md:flex");
    expect(source).toContain("md:min-w-[11rem] md:max-w-[14rem] md:flex-[0_1_13rem]");
    expect(source).toContain('const extraFilterSlots = variant === "es" ? 2 : hasExtraFilter ? 1 : 0');
  });
});
