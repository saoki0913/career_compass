import { describe, expect, it } from "vitest";
import {
  readGuestDeviceToken,
  readGuestDeviceTokenFromCookieHeader,
} from "./guest-cookie";

describe("readGuestDeviceToken", () => {
  const makeCookies = (value: string | undefined) => ({
    cookies: {
      get: (_name: string) =>
        value !== undefined ? { value } : undefined,
    },
  });

  it("returns valid UUID v4", () => {
    const token = "550e8400-e29b-41d4-a716-446655440000";
    expect(readGuestDeviceToken(makeCookies(token) as never)).toBe(token);
  });

  it("rejects non-UUID string", () => {
    expect(
      readGuestDeviceToken(makeCookies("malicious-payload") as never),
    ).toBeNull();
  });

  it("rejects empty string", () => {
    expect(readGuestDeviceToken(makeCookies("") as never)).toBeNull();
  });

  it("rejects UUID v1 format", () => {
    // UUID v1 has version nibble = 1, not 4
    expect(
      readGuestDeviceToken(
        makeCookies("550e8400-e29b-11d4-a716-446655440000") as never,
      ),
    ).toBeNull();
  });

  it("returns null when cookie is missing", () => {
    expect(
      readGuestDeviceToken(makeCookies(undefined) as never),
    ).toBeNull();
  });
});

describe("readGuestDeviceTokenFromCookieHeader", () => {
  it("returns valid UUID v4 from cookie header", () => {
    const token = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      readGuestDeviceTokenFromCookieHeader(`guest_device_token=${token}`),
    ).toBe(token);
  });

  it("rejects non-UUID from cookie header", () => {
    expect(
      readGuestDeviceTokenFromCookieHeader("guest_device_token=bad-value"),
    ).toBeNull();
  });

  it("returns null for missing header", () => {
    expect(readGuestDeviceTokenFromCookieHeader(null)).toBeNull();
    expect(readGuestDeviceTokenFromCookieHeader(undefined)).toBeNull();
  });

  it("returns null for empty header", () => {
    expect(readGuestDeviceTokenFromCookieHeader("")).toBeNull();
  });
});
