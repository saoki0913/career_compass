import type { ReactNode } from "react";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { getAppUrl } from "@/lib/app-url";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { buildSiteStructuredDataGraph } from "@/lib/seo/site-structured-data";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const siteUrl = getAppUrl();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildSiteStructuredDataGraph(siteUrl)),
        }}
      />
      {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
      {children}
    </>
  );
}
