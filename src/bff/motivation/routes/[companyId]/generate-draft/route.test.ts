import { describe, expect, it } from "vitest";

describe("bff/motivation/generate-draft/route", () => {
  it("uses structured logError instead of console.error for error logging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain('import { logError } from "@/lib/logger"');
    expect(source).toContain('logError("motivation-draft:consume-credits"');
    expect(source).not.toMatch(/console\.error\(/);
  });
});
