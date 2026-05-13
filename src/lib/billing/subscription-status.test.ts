import { describe, expect, it } from "vitest";
import { isActiveSubscriptionStatus } from "./subscription-status";

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
