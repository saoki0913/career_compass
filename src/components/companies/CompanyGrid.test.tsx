import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyGrid", () => {
  it("exports component", async () => {
    const mod = await import("./CompanyGrid");
    expect(mod.CompanyGrid).toBeDefined();
  });

  it("uses gap-4 lg:gap-5 for grid spacing", async () => {
    const source = await readFile(new URL("./CompanyGrid.tsx", import.meta.url), "utf8");
    expect(source).toContain("gap-4 lg:gap-5");
  });
});
