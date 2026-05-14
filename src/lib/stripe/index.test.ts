/**
 * Smoke test for src/lib/stripe/index.ts.
 *
 * Implementation migrated from process.env to serverEnv (T3 Env).
 * The module creates a Stripe instance at module scope with
 * serverEnv.STRIPE_SECRET_KEY.
 */
import { describe, it, expect } from "vitest";

describe("stripe module", () => {
  it("exports stripe instance", async () => {
    // Provide a minimal secret so Stripe constructor does not throw.
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
    const mod = await import("./index");
    expect(mod.stripe).toBeDefined();
  });
});
