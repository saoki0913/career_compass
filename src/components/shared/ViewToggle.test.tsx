import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ViewToggle", () => {
  it("exposes button semantics and selected state", async () => {
    const source = await readFile(new URL("./ViewToggle.tsx", import.meta.url), "utf8");

    expect(source).toContain('type="button"');
    expect(source).toContain("aria-pressed={activeKey === option.key}");
    expect(source).toContain('role="group"');
  });
});
