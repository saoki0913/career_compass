/**
 * Guest User API
 *
 * POST: Create or retrieve guest session
 * GET: Validate guest session
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getOrCreateGuestUser, getGuestUser } from "@/lib/auth/guest";
import {
  clearGuestDeviceTokenCookie,
  issueGuestDeviceToken,
  readGuestDeviceToken,
  setGuestDeviceTokenCookie,
} from "@/lib/auth/guest-cookie";
import { getCsrfFailureReason } from "@/lib/csrf";
import { logError } from "@/lib/logger";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Defense-in-depth CSRF check (D-11 hotfix)
    const csrfFailure = getCsrfFailureReason(request);
    if (csrfFailure) {
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      );
    }

    const deviceToken = readGuestDeviceToken(request) || issueGuestDeviceToken();

    // Rate limit guest session creation by device token
    const rateLimitKey = createRateLimitKey("guestAuth", null, deviceToken);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.guestAuth);
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

    const guest = await getOrCreateGuestUser(deviceToken);

    if (!guest) {
      return NextResponse.json(
        { error: "Failed to create guest session" },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      id: guest.id,
      expiresAt: guest.expiresAt.toISOString(),
      isMigrated: !!guest.migratedToUserId,
    });
    setGuestDeviceTokenCookie(response, deviceToken);
    return response;
  } catch (error) {
    logError("create-guest-session", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const deviceToken = readGuestDeviceToken(request);
    if (!deviceToken) {
      return NextResponse.json(
        { error: "Guest session cookie is required" },
        { status: 400 }
      );
    }

    const guest = await getGuestUser(deviceToken);

    if (!guest) {
      const response = NextResponse.json(
        { error: "Guest session not found or expired" },
        { status: 404 }
      );
      clearGuestDeviceTokenCookie(response);
      return response;
    }

    return NextResponse.json({
      id: guest.id,
      expiresAt: guest.expiresAt.toISOString(),
      isValid: true,
    });
  } catch (error) {
    logError("validate-guest-session", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
