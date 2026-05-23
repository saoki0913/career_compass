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
    expect(text).toContain('Skeleton className="h-8 w-40 rounded-lg"');
    expect(text).toContain("SkeletonButton");
    expect(text).toContain("h-10 min-w-0 flex-1 sm:w-32 sm:flex-none");
    expect(text).not.toContain("h-12");
  });

  it("uses the same sidebar toggle offset as the real header", async () => {
    const text = await source();
    const layout = await layoutSource();
    expect(text).toContain("avoidSidebarToggle = true");
    expect(text).toContain("PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET");
    expect(layout).toContain('PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET = "pl-14 lg:pl-0"');
  });

  it("places the optional back skeleton beside the title", async () => {
    const text = await source();
    expect(text).toContain('showBackLink ? <Skeleton className="h-11 w-11 shrink-0 rounded-xl" /> : null');
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
