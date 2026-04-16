import {
  MARKETING_PRO_MONTHLY_JPY,
  MARKETING_STANDARD_MONTHLY_JPY,
} from "@/lib/marketing/pricing-plans";

/** メタタグ・OG・JSON-LD 共通のサイト説明（デフォルト / サブページ用） */
export const siteDescription =
  "就活Pass（シューパス・就活パス）は、エントリーシート（ES）の添削・ES AI・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。";

export const siteDefaultTitle =
  "就活Pass | ES添削・就活AI・エントリーシート・志望動機・締切管理";

const siteSeoKeywords =
  "就活,就活アプリ,就活AI,ES添削,ES AI,エントリーシート,エントリーシート 添削,志望動機,ガクチカ,締切管理,シューパス,就活パス";

/** LP トップ `/` 専用の description（HTML meta と JSON-LD で完全一致させる SSOT） */
const landingRootDescription =
  "就活Pass（シューパス）は、志望動機・自己PR・ガクチカなど 8 種の設問タイプに専用AIで添削する就活アプリ。企業情報を自動で取り込み、AIが出しがちな定型表現も辞書とスコアで検出して書き直し候補を提示します。カード登録不要、月0円から試せます。";

/**
 * パス別のマーケティング用 description を返す（SSOT）。
 * layout.tsx の JSON-LD と page.tsx の metadata を同じ文字列から導出するためのヘルパー。
 */
export function getMarketingDescription(path: string | null | undefined): string {
  if (!path) return siteDescription;
  const normalized = path.split("?")[0].replace(/\/$/, "") || "/";
  if (normalized === "/") return landingRootDescription;
  return siteDescription;
}

export function buildSiteStructuredDataGraph(
  siteUrl: string,
  descriptionOverride?: string,
) {
  const description = descriptionOverride ?? siteDescription;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "就活Pass",
        alternateName: ["シューパス", "就活パス"],
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/icon.png`,
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "就活Pass",
        alternateName: ["シューパス", "就活パス", "Career Compass"],
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description,
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
        description,
        inLanguage: "ja",
        keywords: siteSeoKeywords,
      },
    ],
  };
}
