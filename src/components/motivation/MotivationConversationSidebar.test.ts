import { describe, expect, it } from "vitest";

import { SLOT_PILL_LABELS } from "@/lib/motivation/ui";

describe("MotivationConversationSidebar causalGap labels", () => {
  it("SLOT_PILL_LABELS maps all slots to Japanese labels", () => {
    const slots = [
      "industry_reason",
      "company_reason",
      "self_connection",
      "desired_work",
      "value_contribution",
      "differentiation",
    ] as const;

    for (const slot of slots) {
      expect(SLOT_PILL_LABELS[slot]).toBeTruthy();
      expect(/[　-鿿]/.test(SLOT_PILL_LABELS[slot])).toBe(true);
    }
  });
});
