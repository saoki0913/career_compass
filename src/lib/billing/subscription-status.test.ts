import { describe, expect, it } from "vitest";
import {
  canManageSubscriptionInPortal,
  isActiveSubscriptionStatus,
  requiresBillingPortalAttention,
} from "./subscription-status";

describe("isActiveSubscriptionStatus", () => {
  it("returns true for active status", () => {
    expect(isActiveSubscriptionStatus("active")).toBe(true);
  });

  it("returns true for trialing status", () => {
    expect(isActiveSubscriptionStatus("trialing")).toBe(true);
  });

  it("returns false for canceled status", () => {
    expect(isActiveSubscriptionStatus("canceled")).toBe(false);
  });

  it("returns false for past_due status", () => {
    expect(isActiveSubscriptionStatus("past_due")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isActiveSubscriptionStatus(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isActiveSubscriptionStatus(undefined)).toBe(false);
  });
});

describe("canManageSubscriptionInPortal", () => {
  it("returns true for payment-recovery statuses", () => {
    expect(canManageSubscriptionInPortal("past_due")).toBe(true);
    expect(canManageSubscriptionInPortal("unpaid")).toBe(true);
    expect(canManageSubscriptionInPortal("paused")).toBe(true);
    expect(canManageSubscriptionInPortal("incomplete")).toBe(true);
    expect(canManageSubscriptionInPortal("refunded")).toBe(true);
    expect(canManageSubscriptionInPortal("dispute_lost")).toBe(true);
  });

  it("returns false for terminal or missing statuses", () => {
    expect(canManageSubscriptionInPortal("canceled")).toBe(false);
    expect(canManageSubscriptionInPortal(null)).toBe(false);
  });
});

describe("requiresBillingPortalAttention", () => {
  it("returns true for statuses that need payment recovery", () => {
    expect(requiresBillingPortalAttention("past_due")).toBe(true);
    expect(requiresBillingPortalAttention("unpaid")).toBe(true);
    expect(requiresBillingPortalAttention("paused")).toBe(true);
    expect(requiresBillingPortalAttention("incomplete")).toBe(true);
    expect(requiresBillingPortalAttention("refunded")).toBe(true);
    expect(requiresBillingPortalAttention("dispute_lost")).toBe(true);
  });

  it("returns false for healthy, terminal, or missing statuses", () => {
    expect(requiresBillingPortalAttention("active")).toBe(false);
    expect(requiresBillingPortalAttention("trialing")).toBe(false);
    expect(requiresBillingPortalAttention("canceled")).toBe(false);
    expect(requiresBillingPortalAttention(null)).toBe(false);
  });
});
