import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyDetailSkeleton", () => {
  it("keeps the mobile-safe top spacing used by the loaded page", async () => {
    const source = await readFile(
      new URL("./CompanyDetailSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("pt-8");
    expect(source).toContain("sm:pt-10");
    expect(source).toContain("lg:py-6");
  });

  it("delegates the page header skeleton to the shared product header", async () => {
    const source = await readFile(
      new URL("./CompanyDetailSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ProductPageHeaderSkeleton");
    expect(source).toContain('variant="detail"');
    expect(source).toContain("showBackLink");
  });

  it("mirrors the three-card top layout and full-width corporate info section", async () => {
    const source = await readFile(
      new URL("./CompanyDetailSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("md:grid-cols-3");
    expect(source).toContain("lg:grid-cols-2");
    expect(source).toContain("xl:grid-cols-3");
    expect(source).toContain("締切・予定 | 応募枠 | この企業のES");
    expect(source).toContain("企業情報データベース");
  });
});
