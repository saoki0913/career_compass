import { describe, expect, it } from "vitest";

describe("bff/gakuchika/summaries/route", () => {
  it("uses structured API errors instead of console.error for error logging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain('import { createApiErrorResponse } from "@/bff/api/error-response"');
    expect(source).toContain('code: "GAKUCHIKA_SUMMARIES_FETCH_FAILED"');
    expect(source).toContain('logContext: "gakuchika-summaries:list"');
    expect(source).not.toMatch(/console\.error\(/);
  });

  it("uses the shared latest conversation loader instead of raw array SQL", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain('loadLatestGakuchikaConversationsForOwnedContentIds');
    expect(source).not.toContain("gakuchika_id = any");
  });
});
