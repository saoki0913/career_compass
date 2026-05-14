import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(product)/gakuchika/page.tsx"),
  "utf8",
);

describe("gakuchika list page error handling", () => {
  it("parses list API errors instead of throwing a generic fetch error", () => {
    expect(source).toContain("parseApiErrorResponse");
    expect(source).toContain("GakuchikaListErrorState");
    expect(source).not.toContain('new Error("Failed to fetch")');
    expect(source).not.toContain("throw new Error(\"Failed to fetch\")");
  });
});
