import { describe, it, expect } from "vitest";

describe("ESCard", () => {
  it("exports component", async () => {
    const mod = await import("./ESCard");
    expect(mod.ESCard).toBeDefined();
  });
});
