import { randomBytes, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { serializeSignedCookie } from "better-call";
import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieName,
  isCiE2EAuthEnabled,
} from "@/lib/auth/ci-e2e";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import {
  ensureCiE2ETestUserWithTx,
  hasMatchingSecret,
  parseBearerSecret,
} from "@/app/api/internal/test-auth/shared";

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
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { userId, sessionToken, email } = await db.transaction(async (tx) => {
      const ensuredUser = await ensureCiE2ETestUserWithTx(tx);

      await tx.delete(sessions).where(eq(sessions.userId, ensuredUser.userId));

      const token = randomBytes(32).toString("hex");

      await tx.insert(sessions).values({
        id: randomUUID(),
        userId: ensuredUser.userId,
        token,
        expiresAt,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip")?.trim() ??
          "127.0.0.1",
        userAgent: request.headers.get("user-agent") ?? "ci-e2e-auth",
        createdAt: now,
        updatedAt: now,
      });

      return {
        userId: ensuredUser.userId,
        email: ensuredUser.email,
        sessionToken: token,
      };
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
      },
    });

    response.headers.append(
      "set-cookie",
      await serializeSignedCookie(
        getBetterAuthSessionCookieName(),
        sessionToken,
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
