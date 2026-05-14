/**
 * Barrel re-export test for src/env/index.ts.
 *
 * Validates that the barrel correctly re-exports serverEnv and clientEnv.
 * Since createEnv() reads process.env at import time, this test only runs
 * when SKIP_ENV_VALIDATION=1 is set (which vitest.config provides).
 */
import { describe, it, expect } from "vitest";

describe("env barrel exports", () => {
  it("re-exports serverEnv and clientEnv", async () => {
    // Dynamic import to avoid module-evaluation errors in environments
    // where the full env var set is unavailable. SKIP_ENV_VALIDATION=1
    // should be set in vitest.config.
    const mod = await import("./index");
    expect(mod).toHaveProperty("serverEnv");
    expect(mod).toHaveProperty("clientEnv");
  });
});
