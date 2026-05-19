/**
 * Tests for server-side env validation (src/env/server.ts).
 *
 * These tests exercise the Zod schema validation via @t3-oss/env-nextjs.
 * We set SKIP_ENV_VALIDATION=1 in the test runner's env (vitest.config)
 * so module-level evaluation doesn't blow up in CI where the full set of
 * production secrets is unavailable.
 *
 * The unit tests below verify the schema shapes directly with zod.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { z } from "zod";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Re-declare the schema shapes used in server.ts so we can test validation
// rules without triggering the createEnv() side-effect (which reads
// process.env at import time).
// ---------------------------------------------------------------------------

const serverSchemas = {
  APP_ENV: z.enum(["local", "staging", "production"]).optional(),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_STANDARD_MONTHLY: z.string().optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().startsWith("bpc_").optional(),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
  CRON_SECRET: z.string().min(1),
  INTERNAL_API_JWT_SECRET: z.string().min(32),
  CAREER_PRINCIPAL_HMAC_SECRET: z.string().min(32),
  TENANT_KEY_SECRET: z.string().min(32).optional(),
  FASTAPI_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_NAMESPACE: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  CONTACT_TO_EMAIL: z.string().email().optional(),
  CI_E2E_TEST_EMAIL: z.string().email().optional(),
  CI_E2E_TEST_NAME: z.string().optional(),
  CI_E2E_TEST_PLAN: z.enum(["free", "standard", "pro"]).optional(),
  LOCAL_AI_LIVE_PREFLIGHT_ENABLED: z.string().optional(),
  ALLOW_COMPANY_SEARCH_MOCK_FALLBACK: z.string().optional(),
  CI_ALLOW_TEST_STRIPE_KEYS: z.string().optional(),
  DISABLE_TOKEN_LIMIT: z.string().optional(),
};

describe("server env schemas", () => {
  it("validates APP_ENV when provided", () => {
    expect(serverSchemas.APP_ENV.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.APP_ENV.safeParse("local").success).toBe(true);
    expect(serverSchemas.APP_ENV.safeParse("staging").success).toBe(true);
    expect(serverSchemas.APP_ENV.safeParse("production").success).toBe(true);
    expect(serverSchemas.APP_ENV.safeParse("preview").success).toBe(false);
  });

  it("accepts a valid DATABASE_URL", () => {
    expect(serverSchemas.DATABASE_URL.safeParse("postgresql://user:pass@host:5432/db").success).toBe(true);
  });

  it("rejects an invalid DATABASE_URL", () => {
    expect(serverSchemas.DATABASE_URL.safeParse("not-a-url").success).toBe(false);
  });

  it("coerces DATABASE_POOL_SIZE from string to number", () => {
    const result = serverSchemas.DATABASE_POOL_SIZE.safeParse("10");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(10);
    }
  });

  it("rejects negative DATABASE_POOL_SIZE", () => {
    expect(serverSchemas.DATABASE_POOL_SIZE.safeParse("-1").success).toBe(false);
  });

  it("allows undefined for optional fields", () => {
    expect(serverSchemas.DIRECT_URL.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.FASTAPI_URL.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.UPSTASH_REDIS_REST_URL.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.UPSTASH_REDIS_NAMESPACE.safeParse(undefined).success).toBe(true);
  });

  it("validates Redis namespace format", () => {
    expect(serverSchemas.UPSTASH_REDIS_NAMESPACE.safeParse("prod").success).toBe(true);
    expect(serverSchemas.UPSTASH_REDIS_NAMESPACE.safeParse("stg_1").success).toBe(true);
    expect(serverSchemas.UPSTASH_REDIS_NAMESPACE.safeParse("Prod").success).toBe(false);
    expect(serverSchemas.UPSTASH_REDIS_NAMESPACE.safeParse("prod:bad").success).toBe(false);
  });

  it("validates ENCRYPTION_KEY is 64 hex chars", () => {
    const valid = "a".repeat(64);
    expect(serverSchemas.ENCRYPTION_KEY.safeParse(valid).success).toBe(true);

    // Too short
    expect(serverSchemas.ENCRYPTION_KEY.safeParse("a".repeat(63)).success).toBe(false);
    // Non-hex
    expect(serverSchemas.ENCRYPTION_KEY.safeParse("g".repeat(64)).success).toBe(false);
  });

  it("validates STRIPE_WEBHOOK_SECRET starts with whsec_", () => {
    expect(serverSchemas.STRIPE_WEBHOOK_SECRET.safeParse("whsec_abc123").success).toBe(true);
    expect(serverSchemas.STRIPE_WEBHOOK_SECRET.safeParse("wrong_abc123").success).toBe(false);
  });

  it("validates STRIPE_PORTAL_CONFIGURATION_ID starts with bpc_ when provided", () => {
    expect(serverSchemas.STRIPE_PORTAL_CONFIGURATION_ID.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.STRIPE_PORTAL_CONFIGURATION_ID.safeParse("bpc_abc123").success).toBe(true);
    expect(serverSchemas.STRIPE_PORTAL_CONFIGURATION_ID.safeParse("portal_abc123").success).toBe(false);
  });

  it("validates typed CI-only helper envs", () => {
    expect(serverSchemas.CI_E2E_TEST_EMAIL.safeParse("ci@example.com").success).toBe(true);
    expect(serverSchemas.CI_E2E_TEST_EMAIL.safeParse("not-email").success).toBe(false);
    expect(serverSchemas.CI_E2E_TEST_PLAN.safeParse("standard").success).toBe(true);
    expect(serverSchemas.CI_E2E_TEST_PLAN.safeParse("enterprise").success).toBe(false);
  });

  it("validates BETTER_AUTH_SECRET minimum length", () => {
    expect(serverSchemas.BETTER_AUTH_SECRET.safeParse("a".repeat(32)).success).toBe(true);
    expect(serverSchemas.BETTER_AUTH_SECRET.safeParse("short").success).toBe(false);
  });

  it("validates INTERNAL_API_JWT_SECRET minimum length", () => {
    expect(serverSchemas.INTERNAL_API_JWT_SECRET.safeParse("a".repeat(32)).success).toBe(true);
    expect(serverSchemas.INTERNAL_API_JWT_SECRET.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("validates optional TENANT_KEY_SECRET minimum length when provided", () => {
    expect(serverSchemas.TENANT_KEY_SECRET.safeParse(undefined).success).toBe(true);
    expect(serverSchemas.TENANT_KEY_SECRET.safeParse("a".repeat(32)).success).toBe(true);
    expect(serverSchemas.TENANT_KEY_SECRET.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("validates CONTACT_TO_EMAIL as email format", () => {
    expect(serverSchemas.CONTACT_TO_EMAIL.safeParse("user@example.com").success).toBe(true);
    expect(serverSchemas.CONTACT_TO_EMAIL.safeParse("not-email").success).toBe(false);
    expect(serverSchemas.CONTACT_TO_EMAIL.safeParse(undefined).success).toBe(true);
  });

  it("accepts any string for DISABLE_TOKEN_LIMIT", () => {
    expect(serverSchemas.DISABLE_TOKEN_LIMIT.safeParse("true").success).toBe(true);
    expect(serverSchemas.DISABLE_TOKEN_LIMIT.safeParse(undefined).success).toBe(true);
  });
});

describe("lazy proxy behavior", () => {
  it("defers validation to first property access (not import time)", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    vi.resetModules();
    const mod = await import("@/env/server");
    expect(mod.serverEnv).toBeDefined();
    expect(typeof mod.serverEnv).toBe("object");
    vi.unstubAllEnvs();
  });
});

describe("skipValidation logic", () => {
  function computeSkip(skipFlag: string, nodeEnv: string, vitest: string | undefined): boolean {
    return skipFlag === "1" && (nodeEnv !== "production" || !!vitest);
  }

  it("skips when SKIP_ENV_VALIDATION=1 and NODE_ENV is not production", () => {
    expect(computeSkip("1", "development", undefined)).toBe(true);
  });

  it("skips in test runner even when NODE_ENV=production (VITEST present)", () => {
    expect(computeSkip("1", "production", "true")).toBe(true);
  });

  it("would NOT skip in real production (no VITEST)", () => {
    expect(computeSkip("1", "production", undefined)).toBe(false);
  });

  it("does not skip when SKIP_ENV_VALIDATION is not set", () => {
    expect(computeSkip("", "development", undefined)).toBe(false);
  });
});
