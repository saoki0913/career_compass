import type { MarketingFaq } from "@/lib/marketing/landing-faqs";

export function buildFaqPageJsonLd(faqs: readonly MarketingFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/** Safe for embedding in a script tag (breaks closing script if raw `</script>` appears in text). */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
