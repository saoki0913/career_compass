import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { AuthConfigurationError } from "@/env/capabilities";
import { createApiErrorResponse } from "@/bff/api/error-response";

type AuthHandlers = ReturnType<typeof toNextJsHandler>;

let cachedHandlers: AuthHandlers | null = null;

async function getAuthHandlers(): Promise<AuthHandlers> {
  if (!cachedHandlers) {
    const { auth } = await import("@/lib/auth");
    cachedHandlers = toNextJsHandler(auth);
  }
  return cachedHandlers;
}

function createAuthUnavailableResponse(request: NextRequest, error: unknown) {
  const isAuthConfigError = error instanceof AuthConfigurationError;
  return createApiErrorResponse(request, {
    status: 503,
    code: isAuthConfigError ? "AUTH_CONFIGURATION_UNAVAILABLE" : "AUTH_UNAVAILABLE",
    userMessage: "ログイン機能を一時的に利用できません。",
    action: "時間をおいて再度お試しください。解消しない場合はサポートにお問い合わせください。",
    retryable: true,
    error,
    logContext: "auth-route:unavailable",
    developerMessage: isAuthConfigError
      ? "Auth capability environment is missing or invalid."
      : "Better Auth handler failed before request handling.",
    details: isAuthConfigError
      ? `missing=${error.missingKeys.join(",")}; invalid=${error.invalidKeys.join(",")}`
      : undefined,
  });
}

function isAuthCallbackRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith("/api/auth/callback/");
}

function isAuthErrorRedirect(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    const parsed = new URL(location, "https://www.shupass.jp");
    return parsed.pathname === "/api/auth/error";
  } catch {
    return false;
  }
}

function createAuthRestartRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "auth_restart_required");
  return NextResponse.redirect(loginUrl);
}

function isStateMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "state_mismatch" || /state mismatch/i.test(error.message);
}

export async function GET(request: NextRequest) {
  try {
    const handlers = await getAuthHandlers();
    const response = await handlers.GET(request);
    if (isAuthCallbackRequest(request) && isAuthErrorRedirect(response)) {
      return createAuthRestartRedirect(request);
    }
    return response;
  } catch (error) {
    if (isAuthCallbackRequest(request) && isStateMismatchError(error)) {
      return createAuthRestartRedirect(request);
    }
    return createAuthUnavailableResponse(request, error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const handlers = await getAuthHandlers();
    return handlers.POST(request);
  } catch (error) {
    return createAuthUnavailableResponse(request, error);
  }
}
