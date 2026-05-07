import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ProductLayout (SSR sidebar state)", () => {
  it("imports cookies from next/headers", async () => {
    const source = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(source).toContain("cookies");
    expect(source).toContain("next/headers");
  });

  it("reads the sidebar-collapsed cookie by name during SSR", async () => {
    const source = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(source).toContain('"sidebar-collapsed"');
  });

  it("derives a boolean collapsed value from the cookie", async () => {
    const source = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
    // Must parse the cookie value to a boolean, not pass the raw string
    expect(source).toMatch(/=== "true"|=== 'true'|\.value\s*===|Boolean\(|== "true"|== 'true'/);
  });

  it("passes initialCollapsed to ProductLayoutClient", async () => {
    const source = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(source).toContain("initialCollapsed");
    expect(source).toContain("ProductLayoutClient initialCollapsed={");
  });
});
