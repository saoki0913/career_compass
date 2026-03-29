/**
 * Proxy (Next.js 16)
 *
 * Route protection + CSRF protection.
 * - Origin header validation for state-changing requests (POST/PUT/DELETE/PATCH)
 * - Route-based authentication checks
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logError } from "@/lib/logger";
import { getBetterAuthSessionCookieCandidates } from "@/lib/auth/ci-e2e";
import { readGuestDeviceToken } from "@/lib/auth/guest-cookie";
import { getTrustedOriginSet, getTrustedOrigins } from "@/lib/trusted-origins";
import { getCsrfFailureReason, setCsrfCookie, type CsrfFailureReason } from "@/lib/csrf";
import {
  buildNonceCsp,
  createCspNonce,
  isHtmlDocumentRequest,
} from "@/lib/security/csp";

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/calendar",
  "/settings",
];

// Routes that require plan selection
const PLAN_REQUIRED_ROUTES = [
  "/dashboard",
  "/companies",
  "/calendar",
  "/settings",
];

// Routes that are only for unauthenticated users
const AUTH_ROUTES = ["/login"];

// Paths excluded from CSRF checks
const CSRF_EXEMPT_PATHS = [
  "/api/auth/",       // Better Auth handles its own CSRF
  "/api/webhooks/",   // Webhooks use signature verification
  "/api/internal/test-auth/", // CI-only test auth is guarded by a separate secret
];

// State-changing HTTP methods that require CSRF protection
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function createCsrfErrorResponse(
  request: NextRequest,
  reason: CsrfFailureReason
): NextResponse {
  const developerMessage =
    reason === "missing"
      ? "CSRF validation failed: token missing"
      : "CSRF validation failed: token invalid";

  return createProxyErrorResponse(
    request,
    403,
    reason === "missing" ? "CSRF_TOKEN_MISSING" : "CSRF_TOKEN_INVALID",
    "現在の環境ではこの操作を完了できませんでした。",
    "ページを再読み込みして、もう一度お試しください。",
    developerMessage,
    JSON.stringify({
      pathname: request.nextUrl.pathname,
      method: request.method,
      origin: request.headers.get("origin"),
      hasCookie: Boolean(request.cookies.get("csrf_token")?.value),
      hasHeader: Boolean(request.headers.get("x-csrf-token")),
    })
  );
}

function createProxyErrorResponse(
  request: NextRequest,
  status: number,
  code: string,
  userMessage: string,
  action: string,
  developerMessage: string,
  details: string
): NextResponse {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();

  logError(`proxy:${code}`, new Error(developerMessage), {
    code,
    requestId,
    status,
    details,
    pathname: request.nextUrl.pathname,
  });

  return NextResponse.json(
    {
      error: {
        code,
        userMessage,
        action,
        retryable: false,
      },
      requestId,
      ...(process.env.NODE_ENV === "development"
        ? {
            debug: {
              developerMessage,
              details,
              status,
            },
          }
        : {}),
    },
    {
      status,
      headers: {
        "X-Request-Id": requestId,
      },
    }
  );
}

/**
 * Validate CSRF by checking Origin header against allowed origins.
 * Returns null if valid, or a NextResponse with 403 if invalid.
 */
function validateCsrf(request: NextRequest): NextResponse | null {
  const { method, nextUrl } = request;

  // Only check state-changing methods
  if (!CSRF_METHODS.has(method)) {
    return null;
  }

  // Skip exempt paths
  const pathname = nextUrl.pathname;
  if (CSRF_EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
    return null;
  }

  // Only validate API routes (non-API form posts handled by SameSite cookies)
  if (!pathname.startsWith("/api/")) {
    return null;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return createProxyErrorResponse(
      request,
      403,
      "ORIGIN_REQUIRED",
      "現在の環境ではこの操作を完了できませんでした。",
      "ページを再読み込みして、もう一度お試しください。",
      "CSRF validation failed: origin missing",
      JSON.stringify({
        pathname,
        method,
      })
    );
  }

  const allowedOrigins = getTrustedOriginSet();
  if (allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
    return createProxyErrorResponse(
      request,
      403,
      "ORIGIN_NOT_ALLOWED",
      "現在の環境ではこの操作を完了できませんでした。",
      "公式サイトまたは正しい確認環境で開き直して、もう一度お試しください。",
      "CSRF validation failed: origin not allowed",
      JSON.stringify({
        origin,
        allowedOrigins: getTrustedOrigins(),
      })
    );
  }

  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createCsrfErrorResponse(request, csrfFailure);
  }

  return null;
}

function shouldAttachCsrfCookie(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return false;
  }

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

type CspContext = {
  nonce: string | null;
  csp: string | null;
};

function getCspContext(request: NextRequest): CspContext {
  const accept = request.headers.get("accept") || "";
  if (!isHtmlDocumentRequest(request.nextUrl.pathname, accept, request.method)) {
    return { nonce: null, csp: null };
  }
  const nonce = createCspNonce();
  return { nonce, csp: buildNonceCsp(nonce) };
}

function attachCsp(response: NextResponse, cspContext: CspContext): NextResponse {
  if (cspContext.csp) {
    response.headers.set("Content-Security-Policy", cspContext.csp);
  }
  return response;
}

function createForwardResponse(request: NextRequest, cspContext: CspContext): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-device-token");
  requestHeaders.delete("X-Device-Token");

  const guestDeviceToken = readGuestDeviceToken(request);
  if (guestDeviceToken) {
    requestHeaders.set("x-device-token", guestDeviceToken);
  }

  if (cspContext.nonce) {
    requestHeaders.set("x-nonce", cspContext.nonce);
  }

  return attachCsp(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    cspContext
  );
}

function withCsrfCookie(request: NextRequest, response: NextResponse, cspContext: CspContext): NextResponse {
  if (!request.cookies.get("csrf_token")?.value && shouldAttachCsrfCookie(request)) {
    setCsrfCookie(response);
  }
  return attachCsp(response, cspContext);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cspContext = getCspContext(request);

  // Skip static files and Better Auth / webhook routes for route protection
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.includes(".")
  ) {
    // Still run CSRF check on API routes
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/webhooks")) {
      const csrfResult = validateCsrf(request);
      if (csrfResult) return csrfResult;
    }
    return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
  }

  // CSRF protection for API routes
  const csrfResult = validateCsrf(request);
  if (csrfResult) return csrfResult;

  // Check for session cookie (Better Auth)
  const isAuthenticated = getBetterAuthSessionCookieCandidates().some((cookieName) =>
    Boolean(request.cookies.get(cookieName)?.value)
  );

  // Auth routes - redirect to dashboard if already authenticated
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (isAuthenticated) {
      return withCsrfCookie(request, NextResponse.redirect(new URL("/dashboard", request.url)), cspContext);
    }
    return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
  }

  // Protected routes - require authentication
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return withCsrfCookie(request, NextResponse.redirect(loginUrl), cspContext);
    }
  }

  // Plan required routes - client-side AuthProvider handles plan check
  if (PLAN_REQUIRED_ROUTES.some((route) => pathname.startsWith(route))) {
    return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
  }

  return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
