import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqJsonLd } from "./FaqJsonLd";

describe("FaqJsonLd", () => {
  it("renders FAQPage structured data as a JSON-LD script", async () => {
    const markup = renderToStaticMarkup(
      await FaqJsonLd({
        faqs: [
          {
            question: "クレジットとは何ですか？",
            answer: "AI実行に使うポイントです。",
          },
        ],
      })
    );

    expect(markup).toContain('type="application/ld+json"');
    expect(markup).toContain('"@type":"FAQPage"');
    expect(markup).toContain('"name":"クレジットとは何ですか？"');
    expect(markup).toContain('"text":"AI実行に使うポイントです。"');
  });

  it("returns empty markup when no FAQs are provided", async () => {
    const markup = renderToStaticMarkup(
      await FaqJsonLd({
        faqs: [],
      })
    );

    expect(markup).toBe("");
  });
});
