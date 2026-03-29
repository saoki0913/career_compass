import type { ReactNode } from "react";
import { headers } from "next/headers";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { getAppUrl } from "@/lib/app-url";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { buildSiteStructuredDataGraph } from "@/lib/seo/site-structured-data";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const siteUrl = getAppUrl();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildSiteStructuredDataGraph(siteUrl)),
        }}
      />
      {gaId ? <GoogleAnalytics measurementId={gaId} nonce={nonce} /> : null}
      {children}
    </>
  );
}
