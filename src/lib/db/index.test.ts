import { describe, expect, it } from "vitest";

describe("db module", () => {
  it("exports db instance", async () => {
    const mod = await import("./index");
    expect(mod.db).toBeDefined();
  });
});
