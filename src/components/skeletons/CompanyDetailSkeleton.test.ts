import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyDetailSkeleton", () => {
  it("includes deadline filter pill skeletons", async () => {
    const source = await readFile(
      new URL("./CompanyDetailSkeleton.tsx", import.meta.url),
      "utf8",
    );
    // Deadline section should have filter pills matching deadlineFilterOptions
    expect(source).toContain("filter pill");
  });

  it("renders two-column grid for deadlines and applications", async () => {
    const source = await readFile(
      new URL("./CompanyDetailSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("lg:grid-cols-2");
  });
});
