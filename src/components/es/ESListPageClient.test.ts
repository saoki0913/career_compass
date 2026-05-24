import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ESListPageClient.tsx", import.meta.url), "utf8");
}

describe("ESListPageClient", () => {
  it("hides the description on mobile and shows it from sm up", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeader");
    expect(source).toContain('description="エントリーシートの作成・管理ができます"');
  });

  it("delegates sidebar-toggle clearance to the shared header", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeader");
    expect(source).not.toContain("pl-[4.25rem]");
    expect(source).not.toContain("ProductBackButton");
  });

  it("uses the ES-specific filter layout", async () => {
    const source = await readSource();
    expect(source).toContain('variant="es"');
    expect(source).toContain('extraFilterLayout={companyOptions.length > 0 ? "full" : "pair"}');
    expect(source).toContain('className="h-12 w-full rounded-xl font-normal text-sm lg:h-9 lg:w-[170px]"');
    expect(source).toContain('className="h-12 w-full rounded-xl lg:h-9 lg:w-[160px]"');
    expect(source).not.toContain("ProductBackButton");
    expect(source).toContain('aria-label={showTrash ? "通常表示に戻す" : "ゴミ箱を表示"}');
    expect(source).toContain('aria-label="新規ESを作成"');
  });

  it("keeps the page title", async () => {
    const source = await readSource();
    expect(source).toContain("ES作成");
  });

  it("does not render the secondary all-ES heading", async () => {
    const source = await readSource();
    expect(source).not.toContain("すべてのES");
    expect(source).toContain('aria-label="その他のES"');
    expect(source).toContain("ES_LIST_SECTION_STACK_CLASS");
  });

  it("provides mobile labels for the view toggle", async () => {
    const source = await readSource();
    expect(source).toContain('mobileLabel: "カード"');
    expect(source).toContain('mobileLabel: "リスト"');
  });
});
