/**
 * Proxy (Next.js 16)
 *
 * Route protection + CSRF protection.
 * - Origin header validation for state-changing requests (POST/PUT/DELETE/PATCH)
 * - Route-based authentication checks
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
];

// State-changing HTTP methods that require CSRF protection
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Get allowed origins for CSRF validation
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    origins.add(new URL(appUrl).origin);
  }

  // Always allow localhost in development
  if (process.env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
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

  // Requests without Origin header (e.g., same-origin fetch without CORS)
  // are generally safe due to SameSite cookies, but we still validate when present
  if (!origin) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
    return NextResponse.json(
      { error: "CSRF validation failed: origin not allowed" },
      { status: 403 }
    );
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    return NextResponse.next();
  }

  // CSRF protection for API routes
  const csrfResult = validateCsrf(request);
  if (csrfResult) return csrfResult;

  // Check for session cookie (Better Auth)
  const sessionCookie = request.cookies.get("better-auth.session_token");
  const isAuthenticated = !!sessionCookie?.value;

  // Auth routes - redirect to dashboard if already authenticated
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protected routes - require authentication
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Plan required routes - client-side AuthProvider handles plan check
  if (PLAN_REQUIRED_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  return NextResponse.next();
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
