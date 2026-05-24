import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source() {
  return readFileSync(new URL("./ProductFloatingActionButton.tsx", import.meta.url), "utf8");
}

describe("ProductFloatingActionButton", () => {
  it("uses a 56px (h-14 w-14) FAB size instead of 64px", () => {
    const text = source();
    expect(text).toContain("h-14 w-14");
    expect(text).not.toContain("h-16 w-16");
  });

  it("uses a 24px (h-6 w-6) default icon", () => {
    const text = source();
    expect(text).toContain('h-6 w-6');
  });

  it("hides on sm and above", () => {
    const text = source();
    expect(text).toContain("sm:hidden");
  });
});
