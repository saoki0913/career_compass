import { describe, expect, it } from "vitest";

describe("gakuchika loading.tsx", () => {
  it("imports GakuchikaDeepDiveSkeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./loading.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("GakuchikaDeepDiveSkeleton");
  });

  it("does not wrap in redundant h-screen container", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./loading.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("h-screen");
  });
});
