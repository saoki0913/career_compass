import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("MotivationSetupState type", () => {
  it("does not include roleOptionsError field", async () => {
    const source = await readFile(new URL("./types.ts", import.meta.url), "utf8");
    expect(source).not.toContain("roleOptionsError");
  });
});
