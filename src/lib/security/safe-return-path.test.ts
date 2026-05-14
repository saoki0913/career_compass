import { describe, expect, it } from "vitest";
import {
  getSafeRelativeReturnPath,
  normalizePostAuthReturnPath,
} from "@/lib/security/safe-return-path";

describe("getSafeRelativeReturnPath", () => {
  it("keeps safe relative paths and rejects external or malformed values", () => {
    expect(getSafeRelativeReturnPath("/settings?tab=account")).toBe("/settings?tab=account");
    expect(getSafeRelativeReturnPath("https://evil.example/profile")).toBe("/dashboard");
    expect(getSafeRelativeReturnPath("//evil.example/profile")).toBe("/dashboard");
    expect(getSafeRelativeReturnPath("/profile\r\nLocation: https://evil.example")).toBe("/dashboard");
  });
});

describe("normalizePostAuthReturnPath", () => {
  it("keeps registered post-auth page routes", () => {
    expect(normalizePostAuthReturnPath("/profile")).toBe("/profile");
    expect(normalizePostAuthReturnPath("/settings?tab=account")).toBe("/settings?tab=account");
    expect(normalizePostAuthReturnPath("/pricing/checkout")).toBe("/pricing/checkout");
  });

  it("normalizes stale profile settings paths to the canonical profile route", () => {
    expect(normalizePostAuthReturnPath("/settings/profile")).toBe("/profile");
    expect(normalizePostAuthReturnPath("/settings/profile?from=menu")).toBe("/profile?from=menu");
  });

  it("rejects broad API and unknown same-origin paths", () => {
    expect(normalizePostAuthReturnPath("/api/settings/profile")).toBe("/dashboard");
    expect(normalizePostAuthReturnPath("/missing-page")).toBe("/dashboard");
  });
});
