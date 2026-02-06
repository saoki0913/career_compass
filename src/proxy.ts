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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and API routes (except those we want to protect)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/") || // Better Auth routes
    pathname.startsWith("/api/webhooks") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie (Better Auth)
  const sessionCookie = request.cookies.get("better-auth.session_token");
  const isAuthenticated = !!sessionCookie?.value;

  // Auth routes - redirect to dashboard if already authenticated
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/pricing", request.url));
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

  // Plan required routes - check if user has selected a plan
  // Note: This is a basic check. Full validation happens in the API routes
  // and client-side AuthProvider
  if (PLAN_REQUIRED_ROUTES.some((route) => pathname.startsWith(route))) {
    // For authenticated users, we rely on client-side AuthProvider to check plan status
    // and redirect if needed. This avoids making DB calls in proxy.
    // The API routes perform the actual plan check.
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
