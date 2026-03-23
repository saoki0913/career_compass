import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { STATUS_POLL_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return { userId: null, guestId: guest.id };
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...STATUS_POLL_RATE_LAYERS],
      identity.userId,
      identity.guestId,
      "companies_es_review_status"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const { id } = await params;
    const [company] = await db
      .select({
        id: companies.id,
        userId: companies.userId,
        guestId: companies.guestId,
        infoFetchedAt: companies.infoFetchedAt,
        corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
      })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (
      (identity.userId && company.userId !== identity.userId) ||
      (identity.guestId && company.guestId !== identity.guestId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lastFetchedAt = company.corporateInfoFetchedAt ?? company.infoFetchedAt;

    if (!lastFetchedAt) {
      return NextResponse.json({
        status: "company_selected_not_fetched",
        ready_for_es_review: false,
        reason: "not_fetched",
        total_chunks: 0,
        strategic_chunks: 0,
        last_updated: null,
      });
    }

    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    const response = await fetch(`${fastApiUrl}/api/es/company-status/${id}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({
        status: "company_fetched_but_not_ready",
        ready_for_es_review: false,
        reason: "backend_unavailable",
        total_chunks: 0,
        strategic_chunks: 0,
        last_updated: lastFetchedAt,
      });
    }

    const status = await response.json();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Error fetching ES review company status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
