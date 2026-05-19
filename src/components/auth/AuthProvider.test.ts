import { describe, it, expect } from "vitest";

describe("AuthProvider", () => {
  it("adds visibilitychange listener for plan refresh on tab focus", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("visibilitychange");
    expect(source).toContain("fetchUserPlan");
    expect(source).toContain("document.visibilityState");
  });

  it("debounces visibility-triggered plan refresh with 5s threshold", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("5000");
    expect(source).toContain("Date.now()");
  });

  it("redirects to /onboarding when needsOnboarding is true", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("needsOnboarding");
    expect(source).toContain("onboardingCompleted");
    expect(source).toContain("/onboarding");
  });

  it("defers onboarding redirect while a pricing checkout intent is being resolved", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("shouldDeferOnboardingForPricingIntent");
    expect(source).toContain("window.sessionStorage");
    expect(source).toContain("!deferForPricingIntent");
  });

  it("uses shared plan response type with subscription status", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("UserPlanResponse");
    expect(source).toContain("@/lib/auth/plan-types");
  });

  it("keeps guest migration behind successful plan confirmation", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("if (plan) {");
    expect(source).toContain("await migrateGuestData();");
    expect(source).toContain("setRejectedUserId(userId)");
  });

  it("falls back to guest identity when server rejects the client session", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("await initGuest({ force: true })");
    expect(source).toContain("isCurrentSessionRejected) && !!guest");
  });

  it("retries guest migration after a later successful plan refresh", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("migrationPendingRef");
    expect(source).toContain("if (migrationPendingRef.current)");
    expect(source).toContain("migrationPendingRef.current = true");
  });

  it("does not expose guest init and migration actions from auth context", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("initGuest: () => Promise<void>");
    expect(source).not.toContain("migrateGuestData: () => Promise<void>");
  });
});
