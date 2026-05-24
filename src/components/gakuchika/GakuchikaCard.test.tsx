import { describe, it, expect } from "vitest";

describe("GakuchikaCard", () => {
  it("exports component", async () => {
    const mod = await import("./GakuchikaCard");
    expect(mod.GakuchikaCard).toBeDefined();
    expect(typeof mod.GakuchikaCard).toBe("object"); // memo-wrapped
  });
});
