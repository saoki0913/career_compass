import { describe, it, expect } from "vitest";

describe("useCompanies", () => {
  it("exports correctly", async () => {
    const mod = await import("./useCompanies");
    expect(mod.useCompanies).toBeDefined();
  });
});
