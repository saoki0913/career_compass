import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ListPageFilterBarSkeleton.tsx", import.meta.url), "utf8");
}

describe("ListPageFilterBarSkeleton", () => {
  it("mirrors the mobile stacked filter controls", async () => {
    const source = await readSource();
    expect(source).toContain("type FilterBarSkeletonVariant");
    expect(source).toContain("FILTER_BAR_CONTROL_ROW_CLASS");
    expect(source).toContain("FILTER_BAR_SEARCH_CLASS");
    expect(source).toContain("FILTER_BAR_STATUS_ROW_CLASS");
    expect(source).toContain("FILTER_BAR_SKELETON_PROFILES");
    expect(source).toContain("profile.extraFilterSlots");
  });
});
