import { describe, expect, it } from "vitest";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { buildFaqPageJsonLd, serializeJsonLd } from "./json-ld";

describe("json-ld", () => {
  it("builds FAQPage with Question entities", () => {
    const data = buildFaqPageJsonLd(LANDING_PAGE_FAQS.slice(0, 1));
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("FAQPage");
    expect(Array.isArray(data.mainEntity)).toBe(true);
    expect(data.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: LANDING_PAGE_FAQS[0].question,
      acceptedAnswer: {
        "@type": "Answer",
        text: LANDING_PAGE_FAQS[0].answer,
      },
    });
  });

  it("escapes angle brackets for script safety", () => {
    const raw = serializeJsonLd({ x: "</script>" });
    expect(raw).not.toContain("</script>");
    expect(raw).toContain("\\u003c");
  });
});
