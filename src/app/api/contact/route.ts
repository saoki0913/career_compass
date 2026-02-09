/**
 * Contact API
 *
 * POST: Save contact message (no auth required)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactMessages } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

function isLikelyEmail(email: string): boolean {
  // Simple sanity check (avoid heavy validation / rejecting valid emails).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    return xff.split(",")[0]?.trim() || null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim();
    const subject = body?.subject ? String(body.subject).trim() : null;
    const message = String(body?.message || "").trim();

    if (!email || !isLikelyEmail(email) || email.length > 254) {
      return NextResponse.json({ error: "正しいメールアドレスを入力してください" }, { status: 400 });
    }
    if (!message || message.length < 10) {
      return NextResponse.json({ error: "お問い合わせ内容は10文字以上で入力してください" }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "お問い合わせ内容が長すぎます（最大5000文字）" }, { status: 400 });
    }
    if (subject && subject.length > 200) {
      return NextResponse.json({ error: "件名が長すぎます（最大200文字）" }, { status: 400 });
    }

    // Try to attach a userId when available; contact itself does not require auth.
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    const now = new Date();
    await db.insert(contactMessages).values({
      id: crypto.randomUUID(),
      userId,
      email,
      subject,
      message,
      userAgent: request.headers.get("user-agent"),
      ipAddress: getClientIp(request),
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving contact message:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

