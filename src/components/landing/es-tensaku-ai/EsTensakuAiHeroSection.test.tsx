import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("EsTensakuAiHeroSection — no credit-per-action details", () => {
  it("does not show credit amount in bottom bar", async () => {
    const source = await readFile(new URL("./EsTensakuAiHeroSection.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/\d+ クレジット/);
  });
});
