import { MARKETING_PRO_MONTHLY_JPY, MARKETING_STANDARD_MONTHLY_JPY } from "@/lib/marketing/pricing-plans";
import { buildSiteStructuredDataGraph } from "./site-structured-data";

describe("buildSiteStructuredDataGraph", () => {
  it("uses marketing monthly prices for Standard and Pro offers", () => {
    const graph = buildSiteStructuredDataGraph("https://www.shupass.jp") as {
      "@graph": Array<{ "@type": string; offers?: Array<{ name?: string; price?: string }> }>;
    };
    const app = graph["@graph"].find((n) => n["@type"] === "SoftwareApplication");
    const offers = app?.offers ?? [];
    const std = offers.find((o) => o.name === "Standard");
    const pro = offers.find((o) => o.name === "Pro");
    expect(std?.price).toBe(String(MARKETING_STANDARD_MONTHLY_JPY));
    expect(pro?.price).toBe(String(MARKETING_PRO_MONTHLY_JPY));
  });

  it("marks WebSite language as Japanese", () => {
    const graph = buildSiteStructuredDataGraph("https://www.shupass.jp") as {
      "@graph": Array<{ "@type": string; inLanguage?: string }>;
    };
    const site = graph["@graph"].find((n) => n["@type"] === "WebSite");
    expect(site?.inLanguage).toBe("ja");
  });
});
