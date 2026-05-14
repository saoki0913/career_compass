// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PRICING_INTENT_STORAGE_KEY } from "@/lib/billing/pricing-flow";
import { PricingCheckoutResolver } from "./PricingCheckoutResolver";

const { selectPlanMock, usePricingPlanSelectionMock } = vi.hoisted(() => ({
  selectPlanMock: vi.fn(),
  usePricingPlanSelectionMock: vi.fn(),
}));

vi.mock("@/hooks/usePricingPlanSelection", () => ({
  usePricingPlanSelection: usePricingPlanSelectionMock,
}));

function saveIntent() {
  window.sessionStorage.setItem(
    PRICING_INTENT_STORAGE_KEY,
    JSON.stringify({
      plan: "standard",
      period: "monthly",
      source: "pricing",
      reason: "hero-card",
      expiresAt: Date.now() + 60_000,
    }),
  );
}

describe("PricingCheckoutResolver", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    selectPlanMock.mockReset().mockResolvedValue(undefined);
    usePricingPlanSelectionMock.mockReset().mockReturnValue({
      error: null,
      isLoading: false,
      selectPlan: selectPlanMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("restores a saved pricing intent and delegates plan selection once", async () => {
    saveIntent();

    const { rerender } = render(<PricingCheckoutResolver />);

    await waitFor(() => {
      expect(selectPlanMock).toHaveBeenCalledWith("standard", "monthly", {
        intentSource: "pricing",
        analyticsSource: "pricing",
        reason: "hero-card",
      });
    });

    rerender(<PricingCheckoutResolver />);

    expect(selectPlanMock).toHaveBeenCalledTimes(1);
  });

  it("renders a recovery link when plan selection returns false", async () => {
    saveIntent();
    selectPlanMock.mockResolvedValue(false);

    render(<PricingCheckoutResolver />);

    expect(await screen.findByText("決済画面を開始できませんでした。時間をおいて、もう一度お試しください。")).toBeDefined();
    expect(screen.getByRole("link", { name: "料金ページへ戻る" }).getAttribute("href")).toBe("/pricing");
  });

  it("renders a recovery link when plan selection rejects", async () => {
    saveIntent();
    selectPlanMock.mockRejectedValue(new Error("checkout failed"));

    render(<PricingCheckoutResolver />);

    expect(await screen.findByText("決済画面を開始できませんでした。時間をおいて、もう一度お試しください。")).toBeDefined();
    expect(screen.getByRole("link", { name: "料金ページへ戻る" }).getAttribute("href")).toBe("/pricing");
  });

  it("does not restore intent while pricing selection is still loading", () => {
    saveIntent();
    usePricingPlanSelectionMock.mockReturnValue({
      error: null,
      isLoading: true,
      selectPlan: selectPlanMock,
    });

    render(<PricingCheckoutResolver />);

    expect(selectPlanMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PRICING_INTENT_STORAGE_KEY)).not.toBeNull();
  });

  it("renders a recovery link when the pricing intent is missing", async () => {
    render(<PricingCheckoutResolver />);

    const link = await screen.findByRole("link", { name: "料金ページへ戻る" });
    expect(link.getAttribute("href")).toBe("/pricing");
    expect(screen.getByText("プラン選択を確認できませんでした")).toBeDefined();
    expect(selectPlanMock).not.toHaveBeenCalled();
  });

  it("renders a recovery link when session storage access fails", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    render(<PricingCheckoutResolver />);

    expect(await screen.findByText("ブラウザの保存領域を確認できませんでした。料金ページからもう一度選択してください。")).toBeDefined();
    expect(selectPlanMock).not.toHaveBeenCalled();
  });
});
