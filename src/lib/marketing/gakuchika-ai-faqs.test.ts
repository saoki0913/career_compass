import { describe, it, expect } from "vitest";
import { GAKUCHIKA_AI_PAGE_FAQS } from "./gakuchika-ai-faqs";

describe("Gakuchika AI FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of GAKUCHIKA_AI_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d 問.*\d クレジット/);
      expect(faq.answer).not.toMatch(/下書き.*\d クレジット/);
      expect(faq.answer).not.toContain("返金されます");
    }
  });
});
