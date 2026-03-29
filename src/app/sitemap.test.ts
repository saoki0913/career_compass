import sitemap from "@/app/sitemap";
import { getAppUrl } from "@/lib/app-url";

describe("sitemap", () => {
  it("includes new SEO landing pages", () => {
    const base = getAppUrl();
    const entries = sitemap().map((entry) => entry.url);

    expect(entries).toContain(`${base}/es-tensaku-ai`);
    expect(entries).toContain(`${base}/shukatsu-ai`);
    expect(entries).toContain(`${base}/shukatsu-kanri`);
    expect(entries).toContain(`${base}/entry-sheet-ai`);
    expect(entries).toContain(`${base}/es-ai-guide`);
    expect(entries).toContain(`${base}/data-source-policy`);
  });
});
