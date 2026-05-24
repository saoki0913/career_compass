import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ViewToggle", () => {
  it("exposes button semantics and selected state", async () => {
    const source = await readFile(new URL("./ViewToggle.tsx", import.meta.url), "utf8");

    expect(source).toContain('type="button"');
    expect(source).toContain("aria-pressed={activeKey === option.key}");
    expect(source).toContain('role="group"');
    expect(source).toContain("lg:h-8 lg:w-fit");
    expect(source).toContain("lg:h-7 lg:w-[1.625rem]");
  });

  it("supports optional mobile labels hidden on desktop", async () => {
    const source = await readFile(new URL("./ViewToggle.tsx", import.meta.url), "utf8");

    expect(source).toContain("mobileLabel?: string");
    expect(source).toContain("option.mobileLabel");
    expect(source).toContain("lg:hidden");
  });
});
