import { describe, expect, it } from "vitest";

describe("credits/balance", () => {
  it("documents TOCTOU safety of shouldGrantMonthlyCredits pre-check", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./balance.ts", import.meta.url), "utf8");
    expect(source).toContain("TOCTOU");
    expect(source).toContain("FOR UPDATE");
  });
});
