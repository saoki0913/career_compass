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

/**
 * Custom `/api/auth/*` endpoints that we own (NOT handled by the Better Auth catch-all).
 * These must go through our proxy CSRF + Origin validation like any other API route,
 * so they are intentionally NOT treated as Better Auth managed paths below.
 */
const CUSTOM_AUTH_ROUTE_PATHS = [
  "/api/auth/guest",
  "/api/auth/onboarding",
  "/api/auth/plan",
] as const;

/**
 * Whether `pathname` is handled by the Better Auth catch-all (`/api/auth/[...all]`).
 * Better Auth performs its own Origin / CSRF / token checks internally, so for those
 * paths we skip our proxy-layer CSRF validation. Custom routes listed above are
 * explicitly excluded because Better Auth never sees them.
 */
function isBetterAuthManagedPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/auth/")) return false;
  return !CUSTOM_AUTH_ROUTE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

// Paths excluded from CSRF checks
const CSRF_EXEMPT_PATHS = [
  "/api/webhooks/",   // Webhooks use signature verification
  "/api/internal/test-auth/", // CI-only test auth is guarded by a separate secret
];

// State-changing HTTP methods that require CSRF protection
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Payload size cap for JSON API requests routed through the BFF (D-2 象限①).
 *
 * 1 MiB matches the FastAPI ``JsonPayloadSizeLimitMiddleware`` cap so both
 * edges reject identically-sized bodies. Legitimate JSON requests from our UI
 * (motivation/es-review submissions, document drafts) sit well under 200 KB.
 * Multipart uploads bypass this check and are policed per-route.
 */
const MAX_JSON_PAYLOAD_BYTES = 1 * 1024 * 1024;

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
 * Reject JSON API requests whose bodies exceed ``MAX_JSON_PAYLOAD_BYTES``.
 *
 * The check fires when:
 * 1. The request carries a state-changing method and a JSON Content-Type.
 * 2. ``Content-Length`` is present and exceeds the cap.
 *
 * We also reject ``Transfer-Encoding: chunked`` for JSON endpoints because our
 * legitimate clients (browser fetch, internal tests) always emit Content-Length
 * for JSON bodies. A chunked JSON request is either misconfigured tooling or
 * an attempt to smuggle past the size check.
 *
 * Multipart requests intentionally pass through; per-route logic inspects each
 * uploaded ``file.size`` (see ``fetch-corporate-upload/route.ts``).
 */
function validatePayloadSize(request: NextRequest): NextResponse | null {
  if (!CSRF_METHODS.has(request.method)) return null;

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  // Only police JSON bodies here. multipart/* and application/x-www-form-urlencoded
  // have route-level size checks, and missing Content-Type is allowed to fall
  // through so the 415 surfaces from the route rather than from proxy.
  if (!contentType.startsWith("application/json")) return null;

  const transferEncoding = (
    request.headers.get("transfer-encoding") || ""
  ).toLowerCase();
  if (transferEncoding.includes("chunked")) {
    return createProxyErrorResponse(
      request,
      413,
      "PAYLOAD_CHUNKED_JSON_REJECTED",
      "リクエストを処理できませんでした。",
      "ページを再読み込みして、もう一度お試しください。",
      "Chunked Transfer-Encoding is not permitted for JSON requests",
      JSON.stringify({
        pathname: request.nextUrl.pathname,
        method: request.method,
      })
    );
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) return null;

  const contentLength = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return createProxyErrorResponse(
      request,
      413,
      "PAYLOAD_INVALID_CONTENT_LENGTH",
      "リクエストを処理できませんでした。",
      "ページを再読み込みして、もう一度お試しください。",
      "Content-Length header is not a valid positive integer",
      JSON.stringify({
        pathname: request.nextUrl.pathname,
        contentLengthHeader,
      })
    );
  }

  if (contentLength > MAX_JSON_PAYLOAD_BYTES) {
    return createProxyErrorResponse(
      request,
      413,
      "PAYLOAD_TOO_LARGE",
      "送信データが大きすぎます。",
      "内容を短くしてもう一度お試しください。",
      `JSON payload ${contentLength} bytes exceeds ${MAX_JSON_PAYLOAD_BYTES}`,
      JSON.stringify({
        pathname: request.nextUrl.pathname,
        contentLength,
        maxBytes: MAX_JSON_PAYLOAD_BYTES,
      })
    );
  }

  return null;
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

  // Static assets + webhooks short-circuit: no route-protection, no proxy CSRF.
  // (Webhooks verify request signatures in their own handlers.)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.includes(".")
  ) {
    return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
  }

  // Better Auth catch-all (`/api/auth/[...all]`) performs its own Origin + CSRF
  // validation internally, so we short-circuit here. Custom routes under
  // `/api/auth/` (guest / onboarding / plan) do NOT match and fall through
  // to the full proxy CSRF check below.
  if (isBetterAuthManagedPath(pathname)) {
    return withCsrfCookie(request, createForwardResponse(request, cspContext), cspContext);
  }

  // Reject oversized JSON bodies before any route-level allocation. This runs
  // after Better-Auth short-circuit (those routes are self-policing) but before
  // CSRF validation so we don't waste a request id / log entry on a payload that
  // would have been rejected anyway.
  const payloadResult = validatePayloadSize(request);
  if (payloadResult) return payloadResult;

  // CSRF protection for API routes (including our custom `/api/auth/*` endpoints)
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
