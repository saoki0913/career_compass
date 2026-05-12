import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("legal page — pricing link", () => {
  it("links to LP pricing section instead of standalone /pricing", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/href="\/pricing"/);
    expect(source).toContain('href="/#pricing"');
  });
});
