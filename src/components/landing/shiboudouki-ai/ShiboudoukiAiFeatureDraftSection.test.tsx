import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ShiboudoukiAiFeatureDraftSection — no credit-per-action details", () => {
  it("does not expose per-action credit costs", async () => {
    const source = await readFile(new URL("./ShiboudoukiAiFeatureDraftSection.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/下書き.*\d クレジット/);
    expect(source).not.toMatch(/\d クレジット.*消費/);
  });
});
