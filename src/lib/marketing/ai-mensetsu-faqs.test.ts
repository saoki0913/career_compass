import { describe, it, expect } from "vitest";
import { AI_MENSETSU_PAGE_FAQS } from "./ai-mensetsu-faqs";

describe("AI mensetsu FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of AI_MENSETSU_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/開始.*\d クレジット/);
      expect(faq.answer).not.toMatch(/回答.*\d クレジット/);
      expect(faq.answer).not.toMatch(/講評.*\d クレジット/);
    }
  });
});
