import { describe, expect, it } from "vitest";

describe("bff/gakuchika/resume/route", () => {
  it("union-merges focus arrays from FastAPI response with prior state", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("new Set([...stateForApi.resolvedFocuses");
    expect(source).toContain("new Set([...stateForApi.askedFocuses");
    expect(source).toContain("new Set([...stateForApi.deferredFocuses");
  });

  it("strips draftQualityChecks from client response", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("draftQualityChecks: _dqc");
    expect(source).toContain("...clientState");
  });

  it("returns degraded 200 with fallback question on FastAPI failure instead of 503", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/status:\s*503/);
    expect(source).toContain("FALLBACK_RESUME_QUESTION");
  });

  it("checks for duplicate question before appending to messages", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("lastAssistantMsg");
    expect(source).toMatch(/lastAssistantMsg.*\.content.*\.trim\(\)/);
  });

  it("uses structured logError instead of console.error for error logging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain('import { logError } from "@/lib/logger"');
    expect(source).toContain('logError("gakuchika-resume:consume-credits"');
    expect(source).not.toMatch(/console\.error\(/);
  });
});
