import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("AiMensetsuFeatureFlowSection — no credit-per-action details", () => {
  it("does not expose per-action credit costs", async () => {
    const source = await readFile(new URL("./AiMensetsuFeatureFlowSection.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/開始 \d クレジット/);
    expect(source).not.toMatch(/回答.*各.*\d クレジット/);
    expect(source).not.toMatch(/講評.*\d クレジット/);
  });
});
