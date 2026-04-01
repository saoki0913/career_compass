import type { NextRequest, NextResponse } from "next/server";

export const GUEST_COOKIE_NAME = "guest_device_token";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function issueGuestDeviceToken(): string {
  return crypto.randomUUID();
}

export function readGuestDeviceTokenFromCookieHeader(cookieHeader?: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${GUEST_COOKIE_NAME}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();
      return value || null;
    }
  }

  return null;
}

export function readGuestDeviceToken(request: Pick<NextRequest, "cookies">): string | null {
  return request.cookies.get(GUEST_COOKIE_NAME)?.value ?? null;
}

export function setGuestDeviceTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}

export function clearGuestDeviceTokenCookie(response: NextResponse) {
  response.cookies.set(GUEST_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 0,
  });
}
