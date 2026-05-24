import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./CompaniesPageHeader.tsx", import.meta.url), "utf8");
}

describe("CompaniesPageHeader", () => {
  it("delegates title spacing to the shared product header", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeader");
    expect(source).not.toContain("sm:text-3xl");
  });

  it("keeps the page title and add-company link", async () => {
    const source = await readSource();
    expect(source).toContain("登録企業");
    expect(source).toContain("志望企業の情報や選考状況を管理できます");
    expect(source).toContain("/companies/new");
  });

  it("renders the company count as the shared header badge", async () => {
    const source = await readSource();
    expect(source).toContain("formatCompanyCount");
    expect(source).toContain('typeof count === "number"');
    expect(source).toContain("badge={");
  });
});
