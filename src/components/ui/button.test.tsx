import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

async function readButtonSource() {
  return readFile(new URL("./button.tsx", import.meta.url), "utf8");
}

describe("Button size variants — mobile touch targets", () => {
  it("default size has h-11 mobile with lg:h-9 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toContain("h-11 px-5 py-2");
    expect(source).toContain("lg:h-9 lg:px-4");
  });

  it("xs size has h-9 mobile with lg:h-6 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toMatch(/xs.*h-9.*lg:h-6/)
  });

  it("sm size has h-10 mobile with lg:h-8 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toMatch(/sm.*h-10.*lg:h-8/)
  });

  it("lg size has h-12 mobile with lg:h-11 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toMatch(/lg.*h-12.*lg:h-11/)
  });

  it("icon size has size-11 mobile with lg:size-9 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toContain("size-11 rounded-xl lg:size-9");
  });

  it("icon-xs size has size-9 mobile with lg:size-6 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toContain("size-9 rounded-lg");
    expect(source).toContain("lg:size-6");
  });

  it("icon-sm size has size-10 mobile with lg:size-8 desktop override", async () => {
    const source = await readButtonSource();
    expect(source).toContain("size-10 rounded-lg lg:size-8");
  });

  it("xl and icon-lg sizes are not changed (already 44px+)", async () => {
    const source = await readButtonSource();
    expect(source).toContain('xl: "h-12 rounded-lg px-8 text-base has-[>svg]:px-6"');
    expect(source).toContain('"icon-lg": "size-11 rounded-xl lg:size-10"');
  });
});
