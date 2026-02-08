/**
 * Individual Company API
 *
 * GET: Get a single company by ID
 * PUT: Update a company
 * DELETE: Delete a company
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles, deadlines } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { CompanyStatus, VALID_STATUSES } from "@/lib/constants/status";
import { stripCompanyCredentials } from "@/lib/db/sanitize";
import { logError } from "@/lib/logger";

/**
 * Get current user or guest from request
 */
async function getCurrentIdentity(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
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

/**
 * Check if company belongs to the current user/guest
 */
async function getCompanyIfOwned(companyId: string, identity: NonNullable<Awaited<ReturnType<typeof getCurrentIdentity>>>) {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();

  if (!company) {
    return null;
  }

  // Check ownership
  if (identity.type === "user") {
    if (company.userId !== identity.userId) {
      return null;
    }
  } else {
    if (company.guestId !== identity.guestId) {
      return null;
    }
  }

  return company;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Get deadlines for this company
    const companyDeadlines = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.companyId, id));

    return NextResponse.json({
      company: stripCompanyCredentials(company),
      deadlines: companyDeadlines,
    });
  } catch (error) {
    logError("get-company", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, industry, recruitmentUrl, corporateUrl, notes, status, sortOrder, isPinned } = body;

    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json(
        { error: "Company name cannot be empty" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (industry !== undefined) updateData.industry = industry?.trim() || null;
    if (recruitmentUrl !== undefined) updateData.recruitmentUrl = recruitmentUrl?.trim() || null;
    if (corporateUrl !== undefined) updateData.corporateUrl = corporateUrl?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, id));

    // Get updated company
    const updatedCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .get();

    return NextResponse.json({
      company: updatedCompany ? stripCompanyCredentials(updatedCompany) : null,
      message: "Company updated successfully",
    });
  } catch (error) {
    logError("update-company", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Delete company (deadlines will cascade delete due to schema)
    await db
      .delete(companies)
      .where(eq(companies.id, id));

    return NextResponse.json({
      message: "Company deleted successfully",
    });
  } catch (error) {
    logError("delete-company", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
