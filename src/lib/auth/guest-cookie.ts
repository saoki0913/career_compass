import type { NextRequest, NextResponse } from "next/server";

export const GUEST_COOKIE_NAME = "guest_device_token";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      if (!value || !UUID_V4_RE.test(value)) return null;
      return value;
    }
  }

  return null;
}

export function readGuestDeviceToken(request: Pick<NextRequest, "cookies">): string | null {
  const token = request.cookies.get(GUEST_COOKIE_NAME)?.value ?? null;
  if (!token || !UUID_V4_RE.test(token)) return null;
  return token;
}

export function setGuestDeviceTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    // lax (not strict): guests arriving via external links (e.g. shared LP URLs)
    // need the cookie sent on the initial navigation request.
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
