import {
  MARKETING_PRO_MONTHLY_JPY,
  MARKETING_STANDARD_MONTHLY_JPY,
} from "@/lib/marketing/pricing-plans";

/** メタタグ・OG・JSON-LD 共通のサイト説明 */
export const siteDescription =
  "就活Pass（シューパス・就活パス）は、エントリーシート（ES）の添削・ES AI・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。";

export const siteDefaultTitle =
  "就活Pass | ES添削・就活AI・エントリーシート・志望動機・締切管理";

const siteSeoKeywords =
  "就活,就活アプリ,就活AI,ES添削,ES AI,エントリーシート,エントリーシート 添削,志望動機,ガクチカ,締切管理,シューパス,就活パス";

export function buildSiteStructuredDataGraph(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "就活Pass",
        alternateName: ["シューパス", "就活パス", "Career Compass"],
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: siteDescription,
        keywords: siteSeoKeywords,
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "JPY",
            name: "Free",
          },
          {
            "@type": "Offer",
            price: String(MARKETING_STANDARD_MONTHLY_JPY),
            priceCurrency: "JPY",
            name: "Standard",
            billingIncrement: "P1M",
          },
          {
            "@type": "Offer",
            price: String(MARKETING_PRO_MONTHLY_JPY),
            priceCurrency: "JPY",
            name: "Pro",
            billingIncrement: "P1M",
          },
        ],
      },
      {
        "@type": "WebSite",
        name: "就活Pass",
        alternateName: ["シューパス", "就活パス"],
        url: siteUrl,
        description: siteDescription,
        inLanguage: "ja",
        keywords: siteSeoKeywords,
      },
    ],
  };
}
