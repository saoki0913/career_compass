import { describe, expect, it } from "vitest";

import { shouldFetchCredits, shouldUseGuestFallback } from "@/hooks/useCredits";

describe("useCredits auth gating", () => {
  it("does not fetch credits until auth state is resolved", () => {
    expect(shouldFetchCredits({ isAuthenticated: false, isAuthReady: false })).toBe(false);
    expect(shouldFetchCredits({ isAuthenticated: true, isAuthReady: false })).toBe(false);
  });

  it("fetches credits once auth state is resolved", () => {
    expect(shouldFetchCredits({ isAuthenticated: false, isAuthReady: true })).toBe(true);
    expect(shouldFetchCredits({ isAuthenticated: true, isAuthReady: true })).toBe(true);
  });

  it("falls back to guest defaults only for resolved unauthenticated sessions", () => {
    expect(shouldUseGuestFallback({ isAuthenticated: false, isAuthReady: true })).toBe(true);
    expect(shouldUseGuestFallback({ isAuthenticated: false, isAuthReady: false })).toBe(false);
    expect(shouldUseGuestFallback({ isAuthenticated: true, isAuthReady: true })).toBe(false);
  });
});
