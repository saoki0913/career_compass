import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";

describe("useCompanies", () => {
  it("exports correctly", async () => {
    const mod = await import("./useCompanies");
    expect(mod.useCompanies).toBeDefined();
  });

  it("exposes narrow phase movement helpers for kanban updates", async () => {
    const source = await readFile(new URL("./useCompanies.ts", import.meta.url), "utf8");
    expect(source).toContain("updateCompanyStatus");
    expect(source).toContain("moveCompanyToPhase");
    expect(source).toContain("getDefaultStatusForPhase");
  });
});
