/**
 * Companies API
 *
 * GET: List all companies for the user/guest
 * POST: Create a new company
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

// Plan limits for companies
const COMPANY_LIMITS = {
  guest: 3,
  free: 5,
  standard: Infinity,
  pro: Infinity,
};

type CompanyStatus = "interested" | "applied" | "interview" | "offer" | "rejected" | "withdrawn";

const VALID_STATUSES: CompanyStatus[] = ["interested", "applied", "interview", "offer", "rejected", "withdrawn"];

/**
 * Get current user or guest from request
 */
async function getCurrentIdentity(request: NextRequest) {
  // Try authenticated session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    // Get user's plan
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .get();

    return {
      type: "user" as const,
      userId: session.user.id,
      guestId: null,
      plan: profile?.plan || "free",
    };
  }

  // Try guest token from header
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        type: "guest" as const,
        userId: null,
        guestId: guest.id,
        plan: "guest" as const,
      };
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Build where clause based on identity
    const whereClause = identity.type === "user"
      ? eq(companies.userId, identity.userId!)
      : eq(companies.guestId, identity.guestId!);

    const userCompanies = await db
      .select()
      .from(companies)
      .where(whereClause)
      .orderBy(
        desc(companies.isPinned),
        companies.sortOrder,
        desc(companies.createdAt)
      );

    const limit = COMPANY_LIMITS[identity.plan];

    return NextResponse.json({
      companies: userCompanies,
      count: userCompanies.length,
      limit: limit === Infinity ? null : limit,
      canAddMore: userCompanies.length < limit,
    });
  } catch (error) {
    console.error("Error listing companies:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, industry, recruitmentUrl, corporateUrl, notes, status } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Build where clause based on identity
    const whereClause = identity.type === "user"
      ? eq(companies.userId, identity.userId!)
      : eq(companies.guestId, identity.guestId!);

    // Check for duplicate company name (normalized)
    const normalizedName = name.trim()
      .replace(/株式会社|（株）|\(株\)|㈱/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

    const existingCompanies = await db
      .select()
      .from(companies)
      .where(whereClause);

    const duplicate = existingCompanies.find((c) => {
      const existingNormalized = c.name
        .replace(/株式会社|（株）|\(株\)|㈱/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
      return existingNormalized === normalizedName;
    });

    if (duplicate) {
      return NextResponse.json(
        {
          error: "同じ名前の企業が既に登録されています",
          code: "COMPANY_DUPLICATE",
          existingCompany: { id: duplicate.id, name: duplicate.name },
        },
        { status: 409 }
      );
    }

    // Check company limit
    const limit = COMPANY_LIMITS[identity.plan];
    if (existingCompanies.length >= limit) {
      return NextResponse.json(
        {
          error: identity.type === "guest"
            ? "ゲストユーザーは最大3社まで登録できます。ログインすると制限が解除されます。"
            : identity.plan === "free"
            ? "無料プランは最大5社まで登録できます。プランをアップグレードして無制限に登録しましょう。"
            : "Company limit reached",
          code: "COMPANY_LIMIT_REACHED",
          limit,
          currentCount: existingCompanies.length,
        },
        { status: 403 }
      );
    }

    // Create company
    const now = new Date();
    const newCompany = {
      id: crypto.randomUUID(),
      userId: identity.type === "user" ? identity.userId : null,
      guestId: identity.type === "guest" ? identity.guestId : null,
      name: name.trim(),
      industry: industry?.trim() || null,
      recruitmentUrl: recruitmentUrl?.trim() || null,
      corporateUrl: corporateUrl?.trim() || null,
      notes: notes?.trim() || null,
      status: (status as CompanyStatus) || "interested",
      infoFetchedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(companies).values(newCompany);

    return NextResponse.json({
      company: newCompany,
      message: "Company created successfully",
    });
  } catch (error) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
