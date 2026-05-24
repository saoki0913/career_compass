import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "ReadyOutputBar.tsx"), "utf8");

describe("ReadyOutputBar", () => {
  it("renders action buttons from the actions prop", () => {
    expect(source).toContain("export function ReadyOutputBar");
    expect(source).toContain("actions");
  });

  it("no longer exposes the helperText prop (supplementary text moved into GenerationModal)", () => {
    expect(source).not.toContain("helperText");
  });
});
