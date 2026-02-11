/**
 * Guest User API
 *
 * POST: Create or retrieve guest session
 * GET: Validate guest session
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateGuestUser, getGuestUser } from "@/lib/auth/guest";
import { logError } from "@/lib/logger";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { deviceToken } = await request.json();

    if (!deviceToken || typeof deviceToken !== "string") {
      return NextResponse.json(
        { error: "Device token is required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceToken)) {
      return NextResponse.json(
        { error: "Invalid device token format" },
        { status: 400 }
      );
    }

    // Rate limit guest session creation by device token
    const rateLimitKey = createRateLimitKey("guestAuth", null, deviceToken);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.guestAuth);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const guest = await getOrCreateGuestUser(deviceToken);

    if (!guest) {
      return NextResponse.json(
        { error: "Failed to create guest session" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      id: guest.id,
      deviceToken: guest.deviceToken,
      expiresAt: guest.expiresAt.toISOString(),
      isMigrated: !!guest.migratedToUserId,
    });
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
    const deviceToken = request.headers.get("X-Device-Token");

    if (!deviceToken) {
      return NextResponse.json(
        { error: "Device token header is required" },
        { status: 400 }
      );
    }

    // Validate UUID format (same validation as POST endpoint)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deviceToken)) {
      return NextResponse.json(
        { error: "Invalid device token format" },
        { status: 400 }
      );
    }

    const guest = await getGuestUser(deviceToken);

    if (!guest) {
      return NextResponse.json(
        { error: "Guest session not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: guest.id,
      deviceToken: guest.deviceToken,
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
