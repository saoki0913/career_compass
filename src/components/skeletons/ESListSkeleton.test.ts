import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ESListSkeleton.tsx", import.meta.url), "utf8");
}

describe("ESListSkeleton", () => {
  it("delegates the header skeleton to the shared product header skeleton", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeaderSkeleton");
    expect(source).toContain("actionCount={2}");
    expect(source).toContain("showBackLink");
  });

  it("uses the ES filter skeleton", async () => {
    const source = await readSource();
    expect(source).toContain('ListPageFilterBarSkeleton variant="es"');
  });
});
