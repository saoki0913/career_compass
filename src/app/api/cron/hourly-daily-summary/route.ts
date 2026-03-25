/**
 * Optional hourly trigger: dispatch daily_summary only when current JST hour matches each user's preference.
 * vercel.json からは削除済み（Hobby は毎時 Cron 不可）。Pro 等で毎時 Cron を戻す場合に利用する。
 * GET: 手動または `0 * * * *` の Cron から呼ぶ。
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      console.error("Unauthorized hourly daily-summary cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = getAppUrl();
    const res = await fetch(`${baseUrl}/api/notifications/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ type: "daily_summary", matchPreferredJstHour: true }),
    });
    const body = await res.json();

    return NextResponse.json({
      success: res.ok,
      executedAt: new Date().toISOString(),
      result: body,
    });
  } catch (error) {
    console.error("Hourly daily-summary cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
