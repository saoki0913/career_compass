import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only" to allow testing in a non-server environment
vi.mock("server-only", () => ({}));

import { isSecretMissingError } from "./secret-guard";

describe("isSecretMissingError", () => {
  it("returns true for CAREER_PRINCIPAL_HMAC_SECRET missing", () => {
    const err = new Error("CAREER_PRINCIPAL_HMAC_SECRET is not configured");
    expect(isSecretMissingError(err)).toBe(true);
  });

  it("returns true for INTERNAL_API_JWT_SECRET missing", () => {
    const err = new Error("INTERNAL_API_JWT_SECRET is not configured");
    expect(isSecretMissingError(err)).toBe(true);
  });

  it("returns true when the message contains additional context around the pattern", () => {
    const err = new Error(
      "Failed to build header: CAREER_PRINCIPAL_HMAC_SECRET is not configured in this environment"
    );
    expect(isSecretMissingError(err)).toBe(true);
  });

  it("returns false for unrelated Error", () => {
    const err = new Error("Network timeout");
    expect(isSecretMissingError(err)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isSecretMissingError("string error")).toBe(false);
    expect(isSecretMissingError(null)).toBe(false);
    expect(isSecretMissingError(undefined)).toBe(false);
    expect(isSecretMissingError(42)).toBe(false);
    expect(isSecretMissingError({ message: "CAREER_PRINCIPAL_HMAC_SECRET is not configured" })).toBe(false);
  });
});
