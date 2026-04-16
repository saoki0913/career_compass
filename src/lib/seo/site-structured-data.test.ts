import { MARKETING_PRO_MONTHLY_JPY, MARKETING_STANDARD_MONTHLY_JPY } from "@/lib/marketing/pricing-plans";
import {
  buildSiteStructuredDataGraph,
  getMarketingDescription,
  siteDescription,
} from "./site-structured-data";

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

  it("includes an Organization node with logo", () => {
    const graph = buildSiteStructuredDataGraph("https://www.shupass.jp") as {
      "@graph": Array<{ "@type": string; url?: string; logo?: { url?: string } }>;
    };
    const org = graph["@graph"].find((n) => n["@type"] === "Organization");
    expect(org).toBeDefined();
    expect(org?.url).toBe("https://www.shupass.jp");
    expect(org?.logo?.url).toBe("https://www.shupass.jp/icon.png");
  });

  it("reflects the description override in SoftwareApplication and WebSite nodes", () => {
    const custom = "カスタム description";
    const graph = buildSiteStructuredDataGraph("https://www.shupass.jp", custom) as {
      "@graph": Array<{ "@type": string; description?: string }>;
    };
    const app = graph["@graph"].find((n) => n["@type"] === "SoftwareApplication");
    const site = graph["@graph"].find((n) => n["@type"] === "WebSite");
    expect(app?.description).toBe(custom);
    expect(site?.description).toBe(custom);
  });
});

describe("getMarketingDescription", () => {
  it("returns LP-specific copy for '/'", () => {
    const desc = getMarketingDescription("/");
    expect(desc).toContain("8 種の設問タイプ");
    expect(desc).toContain("カード登録不要");
    expect(desc).not.toBe(siteDescription);
  });

  it("falls back to siteDescription for other marketing paths", () => {
    expect(getMarketingDescription("/pricing")).toBe(siteDescription);
    expect(getMarketingDescription("/about")).toBe(siteDescription);
  });

  it("strips query and trailing slash before routing", () => {
    expect(getMarketingDescription("/?utm=x")).toContain("8 種の設問タイプ");
    expect(getMarketingDescription("/")).toContain("8 種の設問タイプ");
  });

  it("falls back to siteDescription when path is empty", () => {
    expect(getMarketingDescription(null)).toBe(siteDescription);
    expect(getMarketingDescription(undefined)).toBe(siteDescription);
  });
});
