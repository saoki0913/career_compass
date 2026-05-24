import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function layoutSource() {
  return readFileSync(new URL("./product-page-header-layout.ts", import.meta.url), "utf8");
}

describe("product-page-header-layout", () => {
  it("uses a tighter sidebar offset on narrow mobile and restores at sm", () => {
    const text = layoutSource();
    expect(text).toContain('pl-[3.75rem] sm:pl-[4.25rem] lg:pl-0');
  });

  it("keeps desktop layout classes unchanged", () => {
    const text = layoutSource();
    expect(text).toContain("lg:pl-0");
    expect(text).toContain("lg:items-center");
  });
});
