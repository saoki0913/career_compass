import { describe, it, expect } from "vitest";
import { SHUKATSU_AI_PAGE_FAQS } from "./shukatsu-ai-faqs";

describe("Shukatsu AI FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of SHUKATSU_AI_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d〜\d+ クレジット/);
      expect(faq.answer).not.toMatch(/開始.*\d クレジット/);
      expect(faq.answer).not.toMatch(/約 \d+ 回/);
    }
  });
});
