import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("useCalendar", () => {
  it("uses POST for Google event reconcile calls", () => {
    const source = readFileSync(join(process.cwd(), "src/hooks/useCalendar.ts"), "utf8");

    expect(source).toContain('fetch("/api/calendar/google", {');
    expect(source).toContain('method: "POST"');
    expect(source).toContain("body: JSON.stringify({ start, end })");
  });
});
