import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processCalendarSyncBatch } from "@/lib/calendar/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processCalendarSyncBatch();

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Calendar sync cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
