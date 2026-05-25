import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("ESEditorPageClient header layout", () => {
  it("uses compact sticky header height", () => {
    const source = readSource("src/components/es/ESEditorPageClient.tsx");
    expect(source).toContain("min-h-[3rem]");
    expect(source).toContain("lg:h-12");
    expect(source).not.toContain("min-h-[4.25rem]");
    expect(source).not.toContain("lg:h-16");
  });

  it("uses standard sidebar offset values", () => {
    const source = readSource("src/components/es/ESEditorPageClient.tsx");
    expect(source).toContain("pl-[3.75rem]");
    expect(source).toContain("sm:pl-[4.25rem]");
    expect(source).not.toContain("pl-16");
  });
});
