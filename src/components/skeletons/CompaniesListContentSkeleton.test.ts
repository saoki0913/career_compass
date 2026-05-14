import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompaniesListContentSkeleton", () => {
  it("renders the default kanban columns", async () => {
    const source = await readFile(
      new URL("./CompaniesListContentSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("lg:grid-cols-5");
    expect(source).toContain("min-h-[420px]");
  });

  it("includes ListPageFilterBarSkeleton", async () => {
    const source = await readFile(
      new URL("./CompaniesListContentSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ListPageFilterBarSkeleton");
  });
});
