/**
 * Upcoming Deadlines API
 *
 * GET: Get deadlines for the next 7 days (default) or specified period
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deadlines, companies, userProfiles } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

export async function GET(request: NextRequest) {
  try {
    // Get days parameter (default 7)
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "7", 10);
    const maxDays = Math.min(days, 30); // Cap at 30 days

    // Try authenticated session first
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    let userId: string | null = null;
    let guestId: string | null = null;

    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Try guest token
      const deviceToken = request.headers.get("x-device-token");
      if (deviceToken) {
        const guest = await getGuestUser(deviceToken);
        if (guest) {
          guestId = guest.id;
        }
      }
    }

    if (!userId && !guestId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Calculate date range
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + maxDays);

    // Get companies for user/guest
    const userCompanies = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(
        userId
          ? eq(companies.userId, userId)
          : eq(companies.guestId, guestId!)
      );

    if (userCompanies.length === 0) {
      return NextResponse.json({
        deadlines: [],
        count: 0,
        periodDays: maxDays,
      });
    }

    const companyIds = userCompanies.map((c) => c.id);
    const companyMap = new Map(userCompanies.map((c) => [c.id, c.name]));

    // Get upcoming deadlines
    const upcomingDeadlines = await db
      .select()
      .from(deadlines)
      .where(
        and(
          // Company belongs to user
          or(...companyIds.map((id) => eq(deadlines.companyId, id))),
          // Due date is in the future (or today)
          gte(deadlines.dueDate, now),
          // Due date is within the specified period
          lte(deadlines.dueDate, endDate),
          // Not completed
          isNull(deadlines.completedAt)
        )
      )
      .orderBy(deadlines.dueDate);

    // Format response with company names
    const formattedDeadlines = upcomingDeadlines.map((d) => {
      const dueDate = new Date(d.dueDate);
      const diffTime = dueDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        id: d.id,
        companyId: d.companyId,
        company: companyMap.get(d.companyId) || "Unknown",
        type: d.type,
        title: d.title,
        description: d.description,
        dueDate: d.dueDate,
        daysLeft,
        isConfirmed: d.isConfirmed,
        confidence: d.confidence,
        sourceUrl: d.sourceUrl,
      };
    });

    return NextResponse.json({
      deadlines: formattedDeadlines,
      count: formattedDeadlines.length,
      periodDays: maxDays,
    });
  } catch (error) {
    console.error("Error getting upcoming deadlines:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
