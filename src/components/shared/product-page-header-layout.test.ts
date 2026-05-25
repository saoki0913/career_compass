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

  it("exports conversation workspace outer padding token", () => {
    const text = layoutSource();
    expect(text).toContain("CONVERSATION_WORKSPACE_OUTER_PADDING");
    expect(text).toContain("py-4");
    expect(text).toContain("sm:py-5");
    expect(text).toContain("lg:py-4");
  });

  it("exports conversation workspace header row token with lg breakpoint", () => {
    const text = layoutSource();
    expect(text).toContain("CONVERSATION_WORKSPACE_HEADER_ROW");
    expect(text).toContain("mb-3");
    expect(text).toContain("lg:flex-row");
    expect(text).toContain("lg:items-start");
    expect(text).not.toContain("xl:flex-row");
  });
});
