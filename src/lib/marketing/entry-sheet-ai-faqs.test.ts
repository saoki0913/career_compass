import { describe, it, expect } from "vitest";
import { ENTRY_SHEET_AI_PAGE_FAQS } from "./entry-sheet-ai-faqs";

describe("Entry sheet AI FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs", () => {
    for (const faq of ENTRY_SHEET_AI_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d〜\d+ クレジット/);
      expect(faq.answer).not.toMatch(/約 \d+ 回/);
    }
  });
});
