/**
 * Tests for client-side env validation schemas (src/env/client.ts).
 *
 * Like the server test, we verify schema shapes directly to avoid
 * triggering createEnv() side-effects at import time.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

const clientSchemas = {
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
};

describe("client env schemas", () => {
  it("accepts a valid NEXT_PUBLIC_APP_URL", () => {
    expect(clientSchemas.NEXT_PUBLIC_APP_URL.safeParse("https://www.shupass.jp").success).toBe(true);
  });

  it("rejects an invalid NEXT_PUBLIC_APP_URL", () => {
    expect(clientSchemas.NEXT_PUBLIC_APP_URL.safeParse("not-a-url").success).toBe(false);
  });

  it("allows undefined for optional client vars", () => {
    expect(clientSchemas.NEXT_PUBLIC_GA_MEASUREMENT_ID.safeParse(undefined).success).toBe(true);
    expect(clientSchemas.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.safeParse(undefined).success).toBe(true);
    expect(clientSchemas.NEXT_PUBLIC_SENTRY_DSN.safeParse(undefined).success).toBe(true);
  });

  it("accepts a GA measurement ID string", () => {
    expect(clientSchemas.NEXT_PUBLIC_GA_MEASUREMENT_ID.safeParse("G-ABC123").success).toBe(true);
  });
});
