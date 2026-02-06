/**
 * Guest Migration API
 *
 * POST: Migrate guest data to registered user account
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { migrateGuestToUser } from "@/lib/auth/guest";
import { headers } from "next/headers";

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

    const { deviceToken } = await request.json();

    if (!deviceToken || typeof deviceToken !== "string") {
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
