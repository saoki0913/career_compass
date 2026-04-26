import { describe, it, expect } from "vitest";

describe("ProductLayoutClient", () => {
  it("exports ProductLayoutClient component", async () => {
    const mod = await import("./ProductLayoutClient");
    expect(mod.ProductLayoutClient).toBeDefined();
  });
});
