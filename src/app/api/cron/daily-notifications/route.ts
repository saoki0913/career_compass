/**
 * Daily Notifications Cron Job API
 *
 * GET: Triggered by Vercel Cron at JST 9:00 (UTC 0:00) daily
 * Executes deadline reminders, daily summaries, and cleanup
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time token comparison to prevent timing attacks
 */
function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);

  // Length must match for timingSafeEqual
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  try {
    // Verify Vercel Cron authorization with timing-safe comparison
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      console.error("Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Execute batch processes in sequence
    const results: Record<string, unknown> = {};
    const batchTypes = ["deadline_reminders", "daily_summary", "cleanup"];

    for (const type of batchTypes) {
      try {
        const res = await fetch(`${baseUrl}/api/notifications/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        results[type] = await res.json();
      } catch (error) {
        console.error(`Batch ${type} failed:`, error);
        results[type] = { error: "Failed to execute batch" };
      }
    }

    console.log("Daily notifications cron completed:", results);

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Daily notifications cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
