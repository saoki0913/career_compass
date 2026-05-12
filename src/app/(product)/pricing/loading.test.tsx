import { describe, it, expect } from "vitest";

describe("PricingLoading", () => {
  it("exports a default component", async () => {
    const mod = await import("./loading");
    expect(mod.default).toBeDefined();
  });
});
