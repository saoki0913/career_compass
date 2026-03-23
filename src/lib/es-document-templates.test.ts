import { describe, expect, it } from "vitest";
import { getDefaultBlocksForEsCategory } from "@/lib/es-document-templates";

describe("getDefaultBlocksForEsCategory", () => {
  it("returns non-empty blocks for entry_sheet", () => {
    const blocks = getDefaultBlocksForEsCategory("entry_sheet");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]?.type).toBe("h2");
  });

  it("resume template includes 学歴 heading", () => {
    const blocks = getDefaultBlocksForEsCategory("resume");
    const titles = blocks.map((b) => b.content).join("\n");
    expect(titles).toContain("学歴");
  });

  it("generates unique block ids", () => {
    const a = getDefaultBlocksForEsCategory("memo");
    const b = getDefaultBlocksForEsCategory("memo");
    expect(a[0]?.id).not.toBe(b[0]?.id);
  });
});
