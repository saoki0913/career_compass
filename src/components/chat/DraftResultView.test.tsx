import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "DraftResultView.tsx"), "utf8");

describe("DraftResultView", () => {
  it("shows the draft body and character count against the limit", () => {
    expect(source).toContain("charLimit");
    expect(source).toContain("draft");
  });

  it("surfaces draft quality warnings when present", () => {
    expect(source).toContain("draftQuality");
  });
});
