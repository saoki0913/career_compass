/**
 * Guest Migration API
 *
 * POST: Migrate guest data to registered user account
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { migrateGuestToUser } from "@/lib/auth/guest";
import { headers } from "next/headers";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
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

    const { deviceToken } = await request.json();

    if (!deviceToken || typeof deviceToken !== "string" || deviceToken.length > 100) {
      return NextResponse.json(
        { error: "Device token is required" },
        { status: 400 }
      );
    }

    const result = await migrateGuestToUser(deviceToken, session.user.id);

    if (!result) {
      return NextResponse.json(
        { error: "Guest session not found or already migrated" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      guestId: result.guestId,
      userId: result.userId,
      message: "Guest data migrated successfully",
    });
  } catch (error) {
    console.error("Error migrating guest data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
