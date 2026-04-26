import { describe, expect, it } from "vitest";

describe("dashboard/index exports", () => {
  it("does not export ActivationChecklistCard", async () => {
    const mod = await import("./index");
    expect(mod).not.toHaveProperty("ActivationChecklistCard");
  });
});
