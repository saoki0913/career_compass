import { describe, it, expect } from "vitest";

describe("EmptyState", () => {
  it("exports EmptyState component", async () => {
    const mod = await import("./EmptyState");
    expect(mod.EmptyState).toBeDefined();
  });
});
