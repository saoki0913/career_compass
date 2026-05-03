import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("GakuchikaStartScreen", () => {
  it("does not accept an error prop (migrated to snackbar)", async () => {
    const source = await readFile(new URL("./GakuchikaStartScreen.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/error:\s*string/);
    expect(source).not.toContain("bg-destructive/10");
  });
});
