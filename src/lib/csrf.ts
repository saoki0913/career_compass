/**
 * CSRF double-submit cookie protection for high-risk operations.
 *
 * Strategy:
 * 1. Server sets a random CSRF token in a cookie (readable by JS)
 * 2. Client reads the cookie and sends it back in X-CSRF-Token header
 * 3. Server verifies the header matches the cookie value
 *
 * This is layered on top of the existing Origin header validation in proxy.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, randomBytes } from "crypto";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

export type CsrfFailureReason = "missing" | "invalid";

/**
 * Generate a new CSRF token and set it as a cookie on the response.
 */
export function setCsrfCookie(response: NextResponse): string {
  const token = randomBytes(32).toString("hex");
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return token;
}

/**
 * Verify CSRF token from header matches cookie.
 * Returns null if valid, or the failure reason if invalid.
 */
export function getCsrfFailureReason(
  request: Pick<NextRequest, "cookies" | "headers">
): CsrfFailureReason | null {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return "missing";
  }

  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);

  if (cookieBuf.length !== headerBuf.length) {
    return "invalid";
  }

  if (!timingSafeEqual(cookieBuf, headerBuf)) {
    return "invalid";
  }

  return null;
}
