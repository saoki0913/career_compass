import { serializeSignedCookie } from "better-call";
import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { auth } from "@/lib/auth";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieName,
  isCiE2EAuthEnabled,
} from "@/lib/auth/ci-e2e";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import {
  CI_E2E_SCOPE_HEADER,
  ensureCiE2ETestUser,
  hasMatchingSecret,
  parseBearerSecret,
} from "@/app/api/internal/test-auth/shared";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const authSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (!isCiE2EAuthEnabled() || !authSecret || !betterAuthSecret) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "CI_TEST_AUTH_DISABLED",
      userMessage: "このエンドポイントは利用できません。",
      action: "環境設定を確認してください。",
    });
  }

  if (!hasMatchingSecret(authSecret, parseBearerSecret(request.headers.get("authorization")))) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "CI_TEST_AUTH_UNAUTHORIZED",
      userMessage: "認証に失敗しました。",
      action: "GitHub Actions secret を確認してください。",
    });
  }

  try {
    const ensuredUser = await ensureCiE2ETestUser(request.headers.get(CI_E2E_SCOPE_HEADER));
    await db.delete(sessions).where(eq(sessions.userId, ensuredUser.userId));

    const authContext = await auth.$context;
    const session = await authContext.internalAdapter.createSession(ensuredUser.userId);
    if (!session) {
      throw new Error("Better Auth failed to create a session for the CI E2E user");
    }

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
