import { describe, it, expect } from "vitest";
import { ES_TENSAKU_AI_PAGE_FAQS } from "./es-tensaku-ai-faqs";

describe("ES tensaku AI FAQs — no credit-per-action details", () => {
  it("does not contain per-action credit costs or approximate counts", () => {
    for (const faq of ES_TENSAKU_AI_PAGE_FAQS) {
      expect(faq.answer).not.toMatch(/\d〜\d+ クレジット/);
      expect(faq.answer).not.toMatch(/約 \d+ 回/);
    }
  });
});
