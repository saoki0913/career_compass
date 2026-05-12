import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ai-mensetsu page — no credit-per-action details", () => {
  it("does not expose per-action credit costs in MidCTASection", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/\dCR/);
    expect(source).not.toMatch(/クレジット\/回/);
  });
});
