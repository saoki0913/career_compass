import { describe, it, expect } from "vitest";
import { SHIBOUDOUKI_AI_PAGE_FAQS } from "./shiboudouki-ai-faqs";

describe("Shiboudouki AI FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of SHIBOUDOUKI_AI_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d 回.*\d クレジット/);
      expect(faq.answer).not.toMatch(/下書き.*\d クレジット/);
      expect(faq.answer).not.toContain("返金されます");
    }
  });
});
