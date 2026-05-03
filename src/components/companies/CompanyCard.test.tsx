import { describe, it, expect } from "vitest";

describe("CompanyCard", () => {
  it("exports component", async () => {
    const mod = await import("./CompanyCard");
    expect(mod.CompanyCard).toBeDefined();
  });
});
