import { describe, it, expect } from "vitest";

describe("company-loaders", () => {
  it("exports correctly", async () => {
    const mod = await import("./company-loaders");
    expect(mod.getCompaniesPageData).toBeDefined();
    expect(mod.getCompanyDetailPageData).toBeDefined();
  });

  it("uses Google Favicon API for estimated favicon URLs", () => {
    expect("https://www.google.com/s2/favicons?domain=example.co.jp&sz=128").toContain(
      "www.google.com/s2/favicons"
    );
  });
});
