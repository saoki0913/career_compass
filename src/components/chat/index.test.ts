import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("chat/index exports", () => {
  it("re-exports CharLimitSelector and DraftPreviewModal", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("CharLimitSelector");
    expect(source).toContain("DraftPreviewModal");
  });
});
