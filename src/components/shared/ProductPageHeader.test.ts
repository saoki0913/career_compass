import { readFile } from "node:fs/promises";

async function source() {
  return readFile(new URL("./ProductPageHeader.tsx", import.meta.url), "utf8");
}

async function layoutSource() {
  return readFile(new URL("./product-page-header-layout.ts", import.meta.url), "utf8");
}

describe("ProductPageHeader", () => {
  it("keeps product page titles at a single text-2xl size", async () => {
    const text = await layoutSource();
    expect(text).toContain("text-2xl font-bold tracking-tight text-foreground");
    expect(text).not.toMatch(/(?:sm|md|lg|xl):text-[2345]xl/);
  });

  it("keeps route decisions out of the shared header", async () => {
    const text = await source();
    expect(text).not.toContain("usePathname");
    expect(text).not.toContain("pathname");
    expect(text).not.toContain("useSearchParams");
  });

  it("reserves mobile space for the sidebar toggle by default", async () => {
    const text = await source();
    const layout = await layoutSource();
    expect(text).toContain("avoidSidebarToggle = true");
    expect(text).toContain("PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET");
    expect(layout).toContain('PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET = "pl-14 lg:pl-0"');
  });

  it("keeps detail headers stacked until the action area has enough room", async () => {
    const text = await source();
    const layout = await layoutSource();
    expect(text).toContain("PRODUCT_PAGE_HEADER_ROW_CLASS[variant]");
    expect(layout).toContain("detail: \"flex flex-col gap-4 min-[1180px]:flex-row");
  });

  it("renders back links in the title row with the shared icon button", async () => {
    const text = await source();
    expect(text).toContain("ProductBackButton");
    expect(text).toContain("{backLink ? <ProductBackButton href={backLink.href} label={backLink.label} /> : null}");
    expect(text).not.toContain("mb-4 inline-flex min-h-10");
  });
});
