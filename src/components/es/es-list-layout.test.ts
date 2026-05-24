import { describe, it, expect } from "vitest";

describe("es-list-layout", () => {
  it("exports layout constants", async () => {
    const mod = await import("./es-list-layout");
    expect(mod.ES_LIST_GRID_CLASS).toBeDefined();
    expect(mod.ES_CARD_CLASS).toBeDefined();
    expect(mod.ES_CARD_CONTENT_CLASS).toBe("flex h-full flex-col p-3");
    expect(mod.ES_CARD_SKELETON_CLASS).toBeDefined();
    expect(mod.ES_CARD_LINK_FOCUS_CLASS).toBeDefined();
  });
});
