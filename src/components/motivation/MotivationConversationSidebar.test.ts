import { describe, expect, it } from "vitest";

import { SLOT_PILL_LABELS } from "@/features/motivation/domain/ui";

describe("MotivationConversationSidebar", () => {
  it("renders as a fragment without outer wrapper div", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("return (\n    <>");
    expect(source).not.toContain('"space-y-4 xl:flex xl:min-h-0 xl:flex-col xl:space-y-0"');
  });
});

describe("MotivationConversationSidebar draftHelperText", () => {
  it("accepts and renders draftHelperText prop in progress card", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("draftHelperText");
  });
});

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
