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
    expect(source).toContain('className="h-10 w-[150px] rounded-xl font-normal text-sm md:h-9 md:w-[170px]"');
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
});
