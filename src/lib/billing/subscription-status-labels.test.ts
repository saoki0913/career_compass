import { describe, expect, it } from "vitest";
import {
  getSubscriptionStatusLabel,
  getSubscriptionStatusVariant,
  getSubscriptionStatusMessage,
} from "./subscription-status-labels";

describe("subscription-status-labels", () => {
  it("returns correct label for active status", () => {
    expect(getSubscriptionStatusLabel("active")).toBe("有効");
  });

  it("returns correct label for trialing", () => {
    expect(getSubscriptionStatusLabel("trialing")).toBe("トライアル中");
  });

  it("returns correct label for past_due", () => {
    expect(getSubscriptionStatusLabel("past_due")).toBe("支払い遅延");
  });

  it("returns correct label for canceled", () => {
    expect(getSubscriptionStatusLabel("canceled")).toBe("解約済み");
  });

  it("returns cancel-scheduled label when cancelAtPeriodEnd is true", () => {
    expect(getSubscriptionStatusLabel("active", true)).toBe("解約予約済み");
  });

  it("returns soft-success variant for active", () => {
    expect(getSubscriptionStatusVariant("active")).toBe("soft-success");
  });

  it("returns soft-warning variant for past_due", () => {
    expect(getSubscriptionStatusVariant("past_due")).toBe("soft-warning");
  });

  it("returns destructive variant for unpaid", () => {
    expect(getSubscriptionStatusVariant("unpaid")).toBe("destructive");
  });

  it("returns soft-warning variant for cancel-scheduled active", () => {
    expect(getSubscriptionStatusVariant("active", true)).toBe("soft-warning");
  });

  it("returns message for past_due status", () => {
    expect(getSubscriptionStatusMessage("past_due")).toContain("お支払い方法");
  });

  it("returns period-end message for cancel-scheduled", () => {
    const msg = getSubscriptionStatusMessage("active", { cancelAtPeriodEnd: true, periodEnd: "2026-06-01T00:00:00Z" });
    expect(msg).toContain("2026");
  });

  it("returns null message for active status without issues", () => {
    expect(getSubscriptionStatusMessage("active")).toBeNull();
  });
});
