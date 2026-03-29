import { describe, expect, it } from "vitest";

import {
  getCheckoutAbandonState,
  getPurchaseSuccessState,
} from "@/lib/billing/url-state";

describe("billing url state", () => {
  it("detects checkout abandon from pricing query params", () => {
    expect(
      getCheckoutAbandonState(new URLSearchParams("canceled=true&source=pricing"))
    ).toEqual({ canceled: true });
  });

  it("extracts purchase success payload from dashboard query params", () => {
    expect(
      getPurchaseSuccessState(new URLSearchParams("success=true&plan=pro"))
    ).toEqual({ success: true, plan: "pro" });
  });

  it("ignores unrelated dashboard query params", () => {
    expect(getPurchaseSuccessState(new URLSearchParams("foo=bar"))).toEqual({
      success: false,
      plan: null,
    });
  });
});
