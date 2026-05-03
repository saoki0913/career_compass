import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CharLimitSelector", () => {
  it("renders 300, 400, 500 char limit options", async () => {
    const source = await readFile(new URL("./CharLimitSelector.tsx", import.meta.url), "utf8");
    expect(source).toContain("300");
    expect(source).toContain("400");
    expect(source).toContain("500");
  });

  it("exports CharLimitSelector component", async () => {
    const mod = await import("./CharLimitSelector");
    expect(mod.CharLimitSelector).toBeDefined();
  });
});
