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
import { parseBody, contactSchema } from "@/lib/validation";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    return xff.split(",")[0]?.trim() || null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP to prevent spam
    const ip = getClientIp(request) || "unknown";
    const rateLimitKey = createRateLimitKey("contact", null, ip);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.contact);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    // Validate request body with Zod schema
    const parsed = await parseBody(request, contactSchema);
    if (parsed.error) return parsed.error;
    const { email, subject, message } = parsed.data;

    // Try to attach a userId when available; contact itself does not require auth.
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    const now = new Date();
    await db.insert(contactMessages).values({
      id: crypto.randomUUID(),
      userId,
      email,
      subject: subject ?? null,
      message,
      userAgent: request.headers.get("user-agent"),
      ipAddress: ip,
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("save-contact-message", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

