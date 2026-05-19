// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const { routerPushMock, trackEventMock, useAuthMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  trackEventMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: useAuthMock,
}));

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

vi.mock("@/lib/client-error-ui", () => ({
  reportUserFacingError: vi.fn(() => "ユーザー向けエラー"),
}));

vi.mock("@/lib/api-errors", () => ({
  parseApiErrorResponse: vi.fn(async () => new Error("api error")),
}));

import { usePricingPlanSelection } from "./usePricingPlanSelection";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("usePricingPlanSelection", () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    trackEventMock.mockReset();
    useAuthMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    window.history.replaceState(null, "", "/pricing");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes hasActiveSubscription to getPricingSelectionAction", async () => {
    const source = await readFile(join(process.cwd(), "src/hooks/usePricingPlanSelection.ts"), "utf8");
    expect(source).toContain("hasActiveSubscription");
    expect(source).toContain("subscriptionStatus");
    expect(source).toContain("getPricingSelectionAction");
  });

  it("opens billing portal without falling back to checkout for paid subscribers", async () => {
    const source = await readFile(join(process.cwd(), "src/hooks/usePricingPlanSelection.ts"), "utf8");
    expect(source).toContain("handleCheckout");
    expect(source).toContain("openBillingPortal");
    expect(source).toContain("tryClearPricingIntent");
  });

  it("redirects to Checkout even when clearing session storage throws", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userPlan: { plan: "free", hasActiveSubscription: false, subscriptionStatus: null },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      url: "http://localhost:3000/pricing#checkout-started",
    }));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { result } = renderHook(() =>
      usePricingPlanSelection({ intentSource: "pricing" }),
    );
    let navigated = false;
    await act(async () => {
      navigated = await result.current.selectPlan("standard", "monthly");
    });

    expect(navigated).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/stripe/checkout", expect.objectContaining({
      method: "POST",
    }));
    expect(window.location.href).toBe("http://localhost:3000/pricing#checkout-started");
  });

  it("redirects to Portal even when clearing session storage throws", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userPlan: { plan: "standard", hasActiveSubscription: true, subscriptionStatus: "active" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      url: "http://localhost:3000/pricing#portal-started",
    }));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { result } = renderHook(() =>
      usePricingPlanSelection({ intentSource: "pricing" }),
    );
    let navigated = false;
    await act(async () => {
      navigated = await result.current.selectPlan("pro", "monthly");
    });

    expect(navigated).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/stripe/portal", expect.objectContaining({
      method: "POST",
    }));
    expect(window.location.href).toBe("http://localhost:3000/pricing#portal-started");
  });

  it("opens billing portal for paid users with payment recovery status", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userPlan: { plan: "standard", hasActiveSubscription: false, subscriptionStatus: "past_due" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      url: "http://localhost:3000/pricing#portal-started",
    }));

    const { result } = renderHook(() =>
      usePricingPlanSelection({ intentSource: "pricing" }),
    );
    let navigated = false;
    await act(async () => {
      navigated = await result.current.selectPlan("pro", "monthly");
    });

    expect(navigated).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/stripe/portal", expect.objectContaining({
      method: "POST",
    }));
  });

  it("opens billing portal for free-profile users with payment recovery status", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userPlan: { plan: "free", hasActiveSubscription: false, subscriptionStatus: "past_due" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      url: "http://localhost:3000/pricing#portal-started",
    }));

    const { result } = renderHook(() =>
      usePricingPlanSelection({ intentSource: "pricing" }),
    );
    let navigated = false;
    await act(async () => {
      navigated = await result.current.selectPlan("standard", "monthly");
    });

    expect(navigated).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/stripe/portal", expect.objectContaining({
      method: "POST",
    }));
    expect(fetch).not.toHaveBeenCalledWith("/api/stripe/checkout", expect.anything());
  });

  it("opens billing portal for financial-downgrade users", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userPlan: { plan: "free", hasActiveSubscription: false, subscriptionStatus: "refunded" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      url: "http://localhost:3000/pricing#portal-started",
    }));

    const { result } = renderHook(() =>
      usePricingPlanSelection({ intentSource: "pricing" }),
    );
    let navigated = false;
    await act(async () => {
      navigated = await result.current.selectPlan("standard", "monthly");
    });

    expect(navigated).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/stripe/portal", expect.objectContaining({
      method: "POST",
    }));
  });
});
