import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function skeletonSource() {
  return readFileSync(new URL("./ESEditorSkeleton.tsx", import.meta.url), "utf8");
}

function editorSource() {
  return readFileSync(
    new URL("../es/ESEditorPageClient.tsx", import.meta.url),
    "utf8",
  );
}

describe("ESEditorSkeleton", () => {
  it("mirrors compact header height from ESEditorPageClient", () => {
    const skeleton = skeletonSource();
    expect(skeleton).toContain("min-h-[3rem]");
    expect(skeleton).toContain("lg:h-12");
    expect(skeleton).not.toContain("min-h-[4.25rem]");
    expect(skeleton).not.toContain("lg:h-16");
  });

  it("uses standard sidebar offset values matching ESEditorPageClient", () => {
    const skeleton = skeletonSource();
    const editor = editorSource();
    expect(skeleton).toContain("pl-[3.75rem]");
    expect(skeleton).toContain("sm:pl-[4.25rem]");
    expect(editor).toContain("pl-[3.75rem]");
    expect(editor).toContain("sm:pl-[4.25rem]");
  });
});
