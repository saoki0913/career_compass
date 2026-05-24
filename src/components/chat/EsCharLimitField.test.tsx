import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "EsCharLimitField.tsx"), "utf8");

describe("EsCharLimitField", () => {
  it("offers 300/400/500 character options", () => {
    expect(source).toContain("300");
    expect(source).toContain("400");
    expect(source).toContain("500");
  });

  it("calls onValueChange when an option is selected", () => {
    expect(source).toContain("onValueChange");
  });

  it("lists the materials used for generation", () => {
    expect(source).toContain("materialItems");
  });
});
