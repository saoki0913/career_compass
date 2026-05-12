import { describe, it, expect } from "vitest";
import { ES_AI_GUIDE_PAGE_FAQS } from "./es-ai-guide-faqs";

describe("ES AI guide FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of ES_AI_GUIDE_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d〜\d+ クレジット/);
      expect(faq.answer).not.toMatch(/開始.*\d クレジット/);
      expect(faq.answer).not.toMatch(/講評.*\d クレジット/);
    }
  });
});
