import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ESListSkeleton.tsx", import.meta.url), "utf8");
}

describe("ESListSkeleton", () => {
  it("mirrors the real header sidebar-toggle clearance", async () => {
    const source = await readSource();
    expect(source).toContain("pl-14");
    expect(source).toContain("lg:pl-0");
  });

  it("hides the description skeleton on mobile to match the page", async () => {
    const source = await readSource();
    expect(source).toContain('className="hidden sm:block"');
  });
});
