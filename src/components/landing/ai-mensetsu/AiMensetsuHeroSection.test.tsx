import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("AiMensetsuHeroSection — no credit-per-action details", () => {
  it("HERO_CHECKS do not contain per-action credit costs", async () => {
    const source = await readFile(new URL("./AiMensetsuHeroSection.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/開始 \d クレジット/);
    expect(source).not.toMatch(/回答.*各.*クレジット/);
  });
});
