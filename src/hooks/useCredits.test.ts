import { describe, expect, it, vi } from "vitest";

import { shouldFetchCredits, shouldUseGuestFallback, useCredits } from "@/hooks/useCredits";

vi.mock("swr", () => ({
  default: vi.fn((key, fetcher, options) => ({
    data: options?.fallbackData ?? null,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  })),
}));

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

  it("uses server-provided initial data without waiting for a fetch", () => {
    const initialData = {
      type: "user" as const,
      plan: "standard" as const,
      balance: 42,
      monthlyAllocation: 60,
      nextResetAt: "2026-04-01T00:00:00.000Z",
      monthlyFree: {
        companyRagHtmlPages: { remaining: 3, limit: 10 },
        companyRagPdfPages: { remaining: 12, limit: 40 },
        selectionSchedule: { remaining: 2, limit: 5 },
      },
    };

    const result = useCredits({
      isAuthenticated: true,
      isAuthReady: true,
      initialData,
    });

    expect(result.balance).toBe(42);
    expect(result.plan).toBe("standard");
    expect(result.isLoading).toBe(false);
    expect(result.credits).toEqual(initialData);
  });
});
