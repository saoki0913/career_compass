import { describe, expect, it } from "vitest";

function shouldAttemptValidation(env: {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  VITEST?: string;
  STRIPE_SECRET_KEY?: string;
}): boolean {
  const isProduction =
    env.VERCEL_ENV === "production" ||
    (env.NODE_ENV === "production" && !env.VITEST);
  return !!(isProduction || env.STRIPE_SECRET_KEY);
}

function shouldRethrowOnFailure(env: {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  VITEST?: string;
}): boolean {
  return (
    env.VERCEL_ENV === "production" ||
    (env.NODE_ENV === "production" && !env.VITEST)
  );
}

describe("instrumentation stripe validation guard", () => {
  it("attempts validation in Vercel production", () => {
    expect(shouldAttemptValidation({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("attempts validation in non-Vercel production (no VITEST)", () => {
    expect(shouldAttemptValidation({ NODE_ENV: "production" })).toBe(true);
  });

  it("skips in test runner even when NODE_ENV=production", () => {
    expect(
      shouldAttemptValidation({ NODE_ENV: "production", VITEST: "true" }),
    ).toBe(false);
  });

  it("attempts validation in dev when Stripe env is available", () => {
    expect(
      shouldAttemptValidation({
        NODE_ENV: "development",
        STRIPE_SECRET_KEY: "sk_test_abc",
      }),
    ).toBe(true);
  });

  it("skips in dev when Stripe env is unavailable (Turbopack early load)", () => {
    expect(shouldAttemptValidation({ NODE_ENV: "development" })).toBe(false);
  });

  it("rethrows validation errors in production (fail-closed)", () => {
    expect(shouldRethrowOnFailure({ VERCEL_ENV: "production" })).toBe(true);
    expect(shouldRethrowOnFailure({ NODE_ENV: "production" })).toBe(true);
  });

  it("swallows validation errors in dev (Turbopack resilient)", () => {
    expect(shouldRethrowOnFailure({ NODE_ENV: "development" })).toBe(false);
  });
});
