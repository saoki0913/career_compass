import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { isCiE2EAuthEnabled } from "@/lib/auth/ci-e2e";
import {
  CI_E2E_SCOPE_HEADER,
  ensureCiE2ETestUser,
  hasMatchingSecret,
  parseBearerSecret,
  resetCiE2ELiveState,
} from "@/app/api/internal/test-auth/shared";

export async function POST(request: NextRequest) {
  const authSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
  const appUrl = request.nextUrl.origin;

  if (!isCiE2EAuthEnabled(appUrl) || !authSecret || !betterAuthSecret) {
    console.info(JSON.stringify({
      context: "ci-test-reset-live-state",
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
      context: "ci-test-reset-live-state",
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
    const result = await resetCiE2ELiveState(ensuredUser.userId);
    console.info(JSON.stringify({
      context: "ci-test-reset-live-state",
      outcome: "success",
      host: request.nextUrl.hostname,
      scope: request.headers.get(CI_E2E_SCOPE_HEADER) ? "provided" : "default",
    }));

    return NextResponse.json({
      success: true,
      userId: result.userId,
      creditBalance: result.creditBalance,
      deletedCounts: result.deletedCounts,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CI_TEST_RESET_LIVE_STATE_FAILED",
      userMessage: "AI Live の事前状態リセットに失敗しました。",
      action: "ログを確認して再実行してください。",
      error,
      logContext: "ci-test-reset-live-state",
    });
  }
}
