import { describe, expect, it } from "vitest";
import { buildBreadcrumbListJsonLd } from "./breadcrumb-jsonld";

describe("buildBreadcrumbListJsonLd", () => {
  it("builds a BreadcrumbList with 1-based positions and absolute item URLs", () => {
    const data = buildBreadcrumbListJsonLd("https://www.shupass.jp", [
      { name: "ホーム", path: "/" },
      { name: "ツール", path: "/tools" },
      { name: "ES文字数カウント", path: "/tools/es-counter" },
    ]);

    expect(data).not.toBeNull();
    expect(data?.["@context"]).toBe("https://schema.org");
    expect(data?.["@type"]).toBe("BreadcrumbList");
    expect(data?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "ホーム",
        item: "https://www.shupass.jp/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "ツール",
        item: "https://www.shupass.jp/tools",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "ES文字数カウント",
        item: "https://www.shupass.jp/tools/es-counter",
      },
    ]);
  });

  it("strips trailing slashes on siteUrl and normalizes missing leading slash on path", () => {
    const data = buildBreadcrumbListJsonLd("https://www.shupass.jp/", [
      { name: "ホーム", path: "/" },
      { name: "テンプレ", path: "templates" },
    ]);

    expect(data?.itemListElement[0]).toMatchObject({
      item: "https://www.shupass.jp/",
    });
    expect(data?.itemListElement[1]).toMatchObject({
      item: "https://www.shupass.jp/templates",
    });
  });

  it("returns null for an empty crumb list so no JSON-LD is embedded", () => {
    const data = buildBreadcrumbListJsonLd("https://www.shupass.jp", []);
    expect(data).toBeNull();
  });
});
