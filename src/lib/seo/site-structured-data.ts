export const siteDescription =
  "就活Pass（シューパス・就活パス）は、ES添削・就活AI、志望動機・ガクチカの対話支援、企業・締切・Googleカレンダー連携をまとめて使える就活アプリです。";

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
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "JPY",
            name: "Free",
          },
          {
            "@type": "Offer",
            price: "980",
            priceCurrency: "JPY",
            name: "Standard",
            billingIncrement: "P1M",
          },
          {
            "@type": "Offer",
            price: "2980",
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
      },
    ],
  };
}
