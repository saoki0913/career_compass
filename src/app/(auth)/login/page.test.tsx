import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("LoginPage — image-registry guard", () => {
  it("uses LOGO_ASSETS from image registry instead of hardcoded path", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("LOGO_ASSETS");
    expect(source).toContain("LOGO_ASSETS.textClean");
    expect(source).not.toContain('src="/marketing/logo/logo_text_clean.png"');
  });
});
