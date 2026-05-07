/**
 * Guest Migration API
 *
 * POST: Migrate guest data to registered user account
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { migrateGuestToUser } from "@/lib/auth/guest";
import { clearGuestDeviceTokenCookie, readGuestDeviceToken } from "@/lib/auth/guest-cookie";
import { headers } from "next/headers";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getCsrfFailureReason } from "@/lib/csrf";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createApiErrorResponse(request, {
      status: 403,
      code: csrfFailure === "missing" ? "CSRF_TOKEN_MISSING" : "CSRF_TOKEN_INVALID",
      userMessage: "画面を再読み込みして、もう一度お試しください。",
      action: "ページを再読み込みしてください。",
    });
  }

  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "ログインし直してください。",
      });
    }

    const deviceToken = readGuestDeviceToken(request);
    if (!deviceToken) {
      return NextResponse.json({
        success: true,
        migrated: false,
        reason: "guest_session_not_found",
      });
    }

    const rateLimitKey = createRateLimitKey("guestMigrate", session.user.id, null);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.guestMigrate);
    if (!rateLimit.allowed) {
      const response = createApiErrorResponse(request, {
        status: 429,
        code: "RATE_LIMITED",
        userMessage: "しばらく待ってから再試行してください。",
        action: `${rateLimit.resetIn}秒ほど待ってから、もう一度お試しください。`,
      });
      response.headers.set("Retry-After", String(rateLimit.resetIn));
      return response;
    }

    const result = await migrateGuestToUser(deviceToken, session.user.id);

    if (!result) {
      const response = NextResponse.json({
        success: true,
        migrated: false,
        reason: "guest_session_not_found_or_already_migrated",
      });
      clearGuestDeviceTokenCookie(response);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      migrated: true,
      message: "Guest data migrated successfully",
    });
    clearGuestDeviceTokenCookie(response);
    return response;
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GUEST_MIGRATION_FAILED",
      userMessage: "ゲストデータの引き継ぎに失敗しました。",
      action: "時間を置いてから、もう一度お試しください。",
      error,
      logContext: "guest-migrate",
    });
  }
}
