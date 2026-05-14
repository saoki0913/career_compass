/**
 * Minimal smoke test for src/lib/auth/index.ts.
 *
 * The auth module initialises betterAuth() at module scope, which requires
 * DB and env vars. We verify the module exports `auth` and `Session` type
 * via dynamic import with SKIP_ENV_VALIDATION=1.
 */
import { afterEach, describe, it, expect, vi } from "vitest";

describe("auth module", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exports auth instance without unrelated capability env", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const mod = await import("./index");

    expect(mod.auth).toBeDefined();
  });
});
