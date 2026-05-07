import { describe, it, expect } from "vitest";

describe("STARProgressBar", () => {
  it("exports all components", async () => {
    const mod = await import("./STARProgressBar");
    expect(mod.STARStatusBadge).toBeDefined();
    expect(mod.STARProgressBar).toBeDefined();
    expect(mod.STARProgressCompact).toBeDefined();
    expect(mod.STAR_EXPLANATIONS).toBeDefined();
  });
});
