import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("includes new SEO landing pages", () => {
    const entries = sitemap().map((entry) => entry.url);

    expect(entries).toContain("http://localhost:3000/es-tensaku-ai");
    expect(entries).toContain("http://localhost:3000/shukatsu-ai");
    expect(entries).toContain("http://localhost:3000/shukatsu-kanri");
    expect(entries).toContain("http://localhost:3000/entry-sheet-ai");
    expect(entries).toContain("http://localhost:3000/es-ai-guide");
  });
});
