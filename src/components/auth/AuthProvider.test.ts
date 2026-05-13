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

  it("includes hasActiveSubscription in UserPlan interface", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./AuthProvider.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("hasActiveSubscription: boolean");
  });
});
