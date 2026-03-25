import type { MarketingFaq } from "@/lib/marketing/landing-faqs";
import { buildFaqPageJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";

type FaqJsonLdProps = {
  faqs: readonly MarketingFaq[];
};

export function FaqJsonLd({ faqs }: FaqJsonLdProps) {
  if (faqs.length === 0) {
    return null;
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildFaqPageJsonLd(faqs)),
      }}
    />
  );
}
