import { describe, it, expect } from "vitest";

describe("ESCard", () => {
  it("exports component", async () => {
    const mod = await import("./ESCard");
    expect(mod.ESCard).toBeDefined();
  });

  it("uses compact shared density classes", async () => {
    const layout = await import("./es-list-layout");
    expect(layout.ES_CARD_CLASS).toContain("min-h-[120px]");
    expect(layout.ES_CARD_CLASS).toContain("sm:min-h-[128px]");
    expect(layout.ES_CARD_CONTENT_CLASS).toBe("flex h-full flex-col p-3");
    expect(layout.ES_CARD_SKELETON_CLASS).not.toContain("cursor-pointer");
  });
});
