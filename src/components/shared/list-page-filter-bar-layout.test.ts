import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function layoutSource() {
  return readFileSync(new URL("./list-page-filter-bar-layout.ts", import.meta.url), "utf8");
}

describe("list-page-filter-bar-layout 390px mobile optimizations", () => {
  it("uses tighter surface padding below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("p-2.5 min-[390px]:p-3");
  });

  it("uses shorter input height below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("h-[52px] min-[390px]:h-[56px]");
  });

  it("uses shorter select trigger below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("h-11 min-[390px]:h-12");
  });

  it("uses tighter status row gap below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("gap-1.5 min-[390px]:gap-2");
  });

  it("uses smaller status tabs below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("h-9 min-[390px]:h-10");
    expect(text).toContain("px-3 min-[390px]:px-3.5");
    expect(text).toContain("text-[12px] min-[390px]:text-[13px]");
  });

  it("uses smaller count badges below 390px", () => {
    const text = layoutSource();
    expect(text).toContain("px-1.5 min-[390px]:px-2");
    expect(text).toContain("text-[11px] min-[390px]:text-xs");
  });

  it("preserves all lg: desktop classes unchanged", () => {
    const text = layoutSource();
    expect(text).toContain("lg:rounded-xl lg:px-2 lg:py-1.5");
    expect(text).toContain("lg:h-8 lg:rounded-lg");
    expect(text).toContain("lg:h-8 lg:w-[7rem]");
    expect(text).toContain("lg:gap-1");
    expect(text).toContain("lg:h-8 lg:max-w-[4.9rem]");
    expect(text).toContain("lg:px-1 lg:text-[10px]");
  });
});
