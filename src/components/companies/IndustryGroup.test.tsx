import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("IndustryGroup", () => {
  it("uses consistent grid gap with CompanyGrid", async () => {
    const source = await readFile(new URL("./IndustryGroup.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:gap-5");
  });
});
