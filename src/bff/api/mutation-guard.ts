import { NextRequest } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { AuthConfigurationError } from "@/env/capabilities";
import { getCsrfFailureReason } from "@/lib/csrf";
import { getTrustedOriginSet } from "@/lib/trusted-origins";

type AuthSession = NonNullable<Awaited<ReturnType<typeof import("@/lib/auth").auth.api.getSession>>>;

type MutationGuardSuccess = {
  ok: true;
  session: AuthSession;
};

type OwnerMutationGuardSuccess = {
  ok: true;
};

type MutationGuardFailure = {
  ok: false;
  response: Response;
};

export type MutationGuardResult = MutationGuardSuccess | MutationGuardFailure;
export type OwnerMutationGuardResult = OwnerMutationGuardSuccess | MutationGuardFailure;

function isCurrentlyBanned(user: { banned?: boolean | null; banExpires?: Date | string | null }) {
  if (!user.banned) {
    return false;
  }
  if (!user.banExpires) {
    return true;
  }
  return new Date(user.banExpires).getTime() > Date.now();
}

export async function requireUserMutationRequest(request: NextRequest): Promise<MutationGuardResult> {
  const ownerGuard = requireOwnerMutationRequest(request);
  if (!ownerGuard.ok) {
    return ownerGuard;
  }

  let session: Awaited<ReturnType<typeof import("@/lib/auth").auth.api.getSession>>;
  try {
    const { auth } = await import("@/lib/auth");
    session = await auth.api.getSession({
      headers: request.headers,
    });
  } catch (error) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 503,
        code: error instanceof AuthConfigurationError ? "AUTH_CONFIGURATION_UNAVAILABLE" : "AUTH_SESSION_UNAVAILABLE",
        userMessage: "ログイン状態を確認できませんでした。",
        action: "時間をおいて再度お試しください。解消しない場合はサポートにお問い合わせください。",
        retryable: true,
        error,
        logContext: "mutation-guard:get-session",
        developerMessage: "Authenticated session infrastructure failed.",
        details:
          error instanceof AuthConfigurationError
            ? `missing=${error.missingKeys.join(",")}; invalid=${error.invalidKeys.join(",")}`
            : undefined,
      }),
    };
  }

  if (session?.session?.impersonatedBy) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 403,
        code: "IMPERSONATION_MUTATION_FORBIDDEN",
        userMessage: "この操作は現在のセッションでは実行できません。",
        developerMessage: "High-risk mutation rejected for an impersonated session",
      }),
    };
  }

  if (!session?.user?.id || isCurrentlyBanned(session.user)) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Active user session required",
      }),
    };
  }

  return {
    ok: true,
    session,
  };
}

export function requireOwnerMutationRequest(request: NextRequest): OwnerMutationGuardResult {
  const origin = request.headers.get("origin");
  if (!origin) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 403,
        code: "ORIGIN_REQUIRED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: "Origin header is required for mutation requests",
      }),
    };
  }

  const trustedOrigins = getTrustedOriginSet();
  if (trustedOrigins.size > 0 && !trustedOrigins.has(origin)) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 403,
        code: "ORIGIN_NOT_ALLOWED",
        userMessage: "安全確認に失敗しました。公式サイトから開き直してください。",
        developerMessage: "Origin header is not trusted for mutation requests",
      }),
    };
  }

  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return {
      ok: false,
      response: createApiErrorResponse(request, {
        status: 403,
        code: "CSRF_VALIDATION_FAILED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: `CSRF validation failed: ${csrfFailure}`,
      }),
    };
  }

  return { ok: true };
}
