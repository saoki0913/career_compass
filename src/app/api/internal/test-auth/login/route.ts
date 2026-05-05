import { serializeSignedCookie } from "better-call";
import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { auth } from "@/lib/auth";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieName,
  isCiE2EAuthEnabled,
} from "@/lib/auth/ci-e2e";
import {
  CI_E2E_SCOPE_HEADER,
  ensureCiE2ETestUser,
  hasMatchingSecret,
  parseBearerSecret,
} from "@/app/api/internal/test-auth/shared";

export async function POST(request: NextRequest) {
  const authSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const appUrl = request.nextUrl.origin;

  if (!isCiE2EAuthEnabled(appUrl) || !authSecret || !betterAuthSecret) {
    console.info(JSON.stringify({
      context: "ci-test-auth-login",
      outcome: "disabled",
      host: request.nextUrl.hostname,
    }));
    return createApiErrorResponse(request, {
      status: 404,
      code: "CI_TEST_AUTH_DISABLED",
      userMessage: "このエンドポイントは利用できません。",
      action: "環境設定を確認してください。",
    });
  }

  if (!hasMatchingSecret(authSecret, parseBearerSecret(request.headers.get("authorization")))) {
    console.info(JSON.stringify({
      context: "ci-test-auth-login",
      outcome: "unauthorized",
      host: request.nextUrl.hostname,
    }));
    return createApiErrorResponse(request, {
      status: 401,
      code: "CI_TEST_AUTH_UNAUTHORIZED",
      userMessage: "認証に失敗しました。",
      action: "GitHub Actions secret を確認してください。",
    });
  }

  try {
    const ensuredUser = await ensureCiE2ETestUser(request.headers.get(CI_E2E_SCOPE_HEADER));

    const authContext = await auth.$context;
    const session = await authContext.internalAdapter.createSession(ensuredUser.userId);
    if (!session) {
      throw new Error("Better Auth failed to create a session for the CI E2E user");
    }
    console.info(JSON.stringify({
      context: "ci-test-auth-login",
      outcome: "success",
      host: request.nextUrl.hostname,
      scope: request.headers.get(CI_E2E_SCOPE_HEADER) ? "provided" : "default",
    }));

    const response = NextResponse.json({
      success: true,
      user: {
        id: ensuredUser.userId,
        email: ensuredUser.email,
      },
    });

    response.headers.append(
      "set-cookie",
      await serializeSignedCookie(
        getBetterAuthSessionCookieName(),
        session.token,
        betterAuthSecret,
        getBetterAuthSessionCookieAttributes()
      )
    );

    return response;
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CI_TEST_AUTH_FAILED",
      userMessage: "CI 用ログインに失敗しました。",
      action: "ログを確認して再実行してください。",
      error,
      logContext: "ci-test-auth-login",
    });
  }
}
