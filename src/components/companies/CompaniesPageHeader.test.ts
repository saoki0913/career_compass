import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./CompaniesPageHeader.tsx", import.meta.url), "utf8");
}

describe("CompaniesPageHeader", () => {
  it("hides the description paragraph on mobile and shows it from sm up", async () => {
    const source = await readSource();
    // 説明文はスマホでは非表示、sm 以上で表示する
    expect(source).toContain("hidden text-sm leading-6");
    expect(source).toContain("sm:block sm:text-base");
  });

  it("keeps the page title and add-company link", async () => {
    const source = await readSource();
    expect(source).toContain("登録企業");
    expect(source).toContain("/companies/new");
  });
});
