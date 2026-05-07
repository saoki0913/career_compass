import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompaniesListContentSkeleton", () => {
  it("renders company grid cards", async () => {
    const source = await readFile(
      new URL("./CompaniesListContentSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain("xl:grid-cols-4");
  });

  it("includes ListPageFilterBarSkeleton", async () => {
    const source = await readFile(
      new URL("./CompaniesListContentSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ListPageFilterBarSkeleton");
  });
});
