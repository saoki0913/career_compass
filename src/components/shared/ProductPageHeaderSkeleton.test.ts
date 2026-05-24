import { readFile } from "node:fs/promises";

async function source() {
  return readFile(new URL("./ProductPageHeaderSkeleton.tsx", import.meta.url), "utf8");
}

async function layoutSource() {
  return readFile(new URL("./product-page-header-layout.ts", import.meta.url), "utf8");
}

describe("ProductPageHeaderSkeleton", () => {
  it("matches the product title height without oversized controls", async () => {
    const text = await source();
    expect(text).toContain('Skeleton className="h-7 w-36 rounded-lg lg:w-40"');
    expect(text).toContain("SkeletonButton");
    expect(text).toContain("col-start-2 row-start-1 flex min-w-0 shrink-0 flex-wrap justify-end gap-2 justify-self-end lg:w-auto");
    expect(text).toContain("h-11 min-w-0 flex-1 rounded-xl lg:h-9 lg:w-28 lg:flex-none");
  });

  it("uses the same sidebar toggle offset as the real header", async () => {
    const text = await source();
    const layout = await layoutSource();
    expect(text).toContain("avoidSidebarToggle = true");
    expect(text).toContain("PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET");
    expect(layout).toContain('PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET = "pl-[4.25rem] lg:pl-0"');
  });

  it("places the optional back skeleton beside the title", async () => {
    const text = await source();
    expect(text).toContain('showBackLink ? <Skeleton className="h-12 w-12 shrink-0 rounded-2xl lg:h-9 lg:w-9 lg:rounded-xl" /> : null');
    expect(text).not.toContain("mb-4 h-5 w-28");
  });

  it("lets always-visible descriptions match real headers", async () => {
    const text = await source();
    expect(text).toContain('descriptionMode?: "desktop" | "always"');
    expect(text).toContain('descriptionMode = "desktop"');
    expect(text).toContain('widths={["min(18rem,100%)"]}');
    expect(text).toContain('descriptionMode === "desktop" ? "hidden sm:block" : undefined');
  });
});
