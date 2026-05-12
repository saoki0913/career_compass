import { describe, expect, it } from "vitest";

import { SLOT_PILL_LABELS } from "@/features/motivation/domain/ui";

describe("MotivationConversationSidebar", () => {
  it("delegates to ConversationSidebar shared component", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationSidebar");
    expect(source).toContain("return (\n    <ConversationSidebar");
  });

  it("does not import removed lifecycle utilities", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("getMotivationLifecyclePhase");
    expect(source).not.toContain("getMotivationPhaseStatus");
    expect(source).not.toContain("MOTIVATION_LIFECYCLE_PHASES");
    expect(source).not.toContain("ConversationSidebarCard");
  });

  it("uses computePhaseItems from shared conversation-lifecycle", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("computePhaseItems");
    expect(source).toContain("toStandardPhase");
    expect(source).toContain("@/lib/shared/conversation-lifecycle");
  });
});

describe("MotivationConversationSidebar draftHelperText", () => {
  it("accepts and renders draftHelperText prop in progress card", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("draftHelperText");
  });
});

describe("MotivationConversationSidebar progressColumns", () => {
  it("uses 2-column progress layout", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("progressColumns={2}");
    expect(source).not.toContain("progressColumns={STAGE_ORDER.length}");
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

  it("uses CAUSAL_GAP_DISPLAY_LABELS for gap slot display with fallback", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("CAUSAL_GAP_DISPLAY_LABELS");
    expect(source).toContain("補強ポイント");
  });
});

describe("MotivationConversationSidebar deepdive completion", () => {
  it("shows all-done progress stages when deepdive has no remaining gaps", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./MotivationConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('isDeepDive && causalGaps.length === 0');
    expect(source).toContain('"done"');
  });
});
