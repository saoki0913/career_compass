import { describe, expect, it } from "vitest";

describe("bff/gakuchika/summary-server", () => {
  it("uses structured logError instead of console.error for error logging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./summary-server.ts", import.meta.url), "utf8");
    expect(source).toContain('import { logError } from "@/lib/logger"');
    expect(source).toContain('logError("gakuchika-summary:consume-credits"');
    expect(source).not.toMatch(/console\.error\(/);
  });
});
