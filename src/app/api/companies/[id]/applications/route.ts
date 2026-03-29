/**
 * Company Applications API
 *
 * GET: List applications for a company
 * POST: Create a new application
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, companies, deadlines } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

// Default phases by type
const DEFAULT_PHASES: Record<string, string[]> = {
  summer_intern: ["ES提出", "WEBテスト", "GD", "面接", "インターン参加"],
  fall_intern: ["ES提出", "WEBテスト", "GD", "面接", "インターン参加"],
  winter_intern: ["ES提出", "WEBテスト", "GD", "面接", "インターン参加"],
  early: ["ES提出", "WEBテスト", "一次面接", "二次面接", "最終面接", "内定"],
  main: ["ES提出", "WEBテスト", "一次面接", "二次面接", "最終面接", "内定"],
  other: ["ES提出", "面接", "結果"],
};

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  // Try authenticated session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return {
      userId: session.user.id,
      guestId: null,
    };
  }

  // Try guest token
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        userId: null,
        guestId: guest.id,
      };
    }
  }

  return null;
}

async function verifyCompanyAccess(
  companyId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const whereClause = userId
    ? and(eq(companies.id, companyId), eq(companies.userId, userId))
    : guestId
    ? and(eq(companies.id, companyId), eq(companies.guestId, guestId))
    : null;

  if (!whereClause) {
    return false;
  }

  const [company] = await db.select().from(companies).where(whereClause).limit(1);
  return !!company;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Get identity
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    // Verify company access
    const hasAccess = await verifyCompanyAccess(companyId, userId, guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const appDeadlineRows = await db
      .select({
        application: applications,
        deadline: {
          id: deadlines.id,
          title: deadlines.title,
          dueDate: deadlines.dueDate,
          type: deadlines.type,
          completedAt: deadlines.completedAt,
        },
      })
      .from(applications)
      .leftJoin(deadlines, eq(deadlines.applicationId, applications.id))
      .where(eq(applications.companyId, companyId))
      .orderBy(applications.sortOrder, desc(applications.createdAt), desc(deadlines.dueDate));

    const groupedApplications = new Map<
      string,
      {
        application: typeof applications.$inferSelect;
        deadlines: Array<{
          id: string;
          title: string | null;
          dueDate: Date;
          type: string;
          completedAt: Date | null;
        }>;
      }
    >();

    for (const row of appDeadlineRows) {
      const app = row.application;
      const current = groupedApplications.get(app.id) || {
        application: app,
        deadlines: [],
      };
      if (row.deadline?.id) {
        current.deadlines.push({
          id: row.deadline.id,
          title: row.deadline.title,
          dueDate: row.deadline.dueDate,
          type: row.deadline.type,
          completedAt: row.deadline.completedAt,
        });
      }
      groupedApplications.set(app.id, current);
    }

    const now = new Date();
    const appsWithDeadlines = Array.from(groupedApplications.values()).map(({ application, deadlines: deadlineList }) => {
      const upcomingDeadlines = deadlineList.filter(
        (d) => new Date(d.dueDate) > now && !d.completedAt
      );
      const nearestDeadline = upcomingDeadlines
        .toSorted((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

      return {
        ...application,
        phase: application.phase ? JSON.parse(application.phase) : DEFAULT_PHASES[application.type] || [],
        deadlineCount: deadlineList.length,
        upcomingDeadlineCount: upcomingDeadlines.length,
        nearestDeadline: nearestDeadline
          ? {
              id: nearestDeadline.id,
              title: nearestDeadline.title,
              dueDate: nearestDeadline.dueDate,
              type: nearestDeadline.type,
            }
          : null,
      };
    });

    return NextResponse.json({
      applications: appsWithDeadlines,
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Get identity
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    // Verify company access
    const hasAccess = await verifyCompanyAccess(companyId, userId, guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "名前とタイプは必須です" },
        { status: 400 }
      );
    }

    const validTypes = ["summer_intern", "fall_intern", "winter_intern", "early", "main", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "無効なタイプです" },
        { status: 400 }
      );
    }

    const [existingAppCountRow] = await db
      .select({ count: count() })
      .from(applications)
      .where(eq(applications.companyId, companyId))
      .limit(1);

    const existingAppCount = Number(existingAppCountRow?.count ?? 0);
    if (existingAppCount >= 10) {
      return NextResponse.json(
        { error: "1企業あたりの応募枠は最大10件までです" },
        { status: 400 }
      );
    }

    const now = new Date();
    const newApp = await db
      .insert(applications)
      .values({
        id: crypto.randomUUID(),
        companyId,
        userId,
        guestId,
        name,
        type,
        phase: JSON.stringify(DEFAULT_PHASES[type] || []),
        sortOrder: existingAppCount,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({
      application: {
        ...newApp[0],
        phase: DEFAULT_PHASES[type] || [],
        deadlineCount: 0,
        upcomingDeadlineCount: 0,
        nearestDeadline: null,
      },
    });
  } catch (error) {
    console.error("Error creating application:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
