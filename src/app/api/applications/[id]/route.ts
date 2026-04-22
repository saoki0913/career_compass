/**
 * Application API
 *
 * GET: Get application details
 * PUT: Update application
 * DELETE: Delete application
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applications, companies, deadlines, jobTypes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { getOwnedApplicationRecord } from "@/app/api/_shared/owner-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const application = await getOwnedApplicationRecord(applicationId, identity);

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, application.companyId))
      .limit(1);

    // Get job types
    const jobTypeList = await db
      .select()
      .from(jobTypes)
      .where(eq(jobTypes.applicationId, applicationId))
      .orderBy(jobTypes.sortOrder);

    // Get deadlines
    const deadlineList = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.applicationId, applicationId));

    return NextResponse.json({
      application: {
        ...application,
        phase: application.phase ? JSON.parse(application.phase) : [],
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            industry: company.industry,
          }
        : null,
      jobTypes: jobTypeList,
      deadlines: deadlineList,
    });
  } catch (error) {
    console.error("Error fetching application:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const existingApp = await getOwnedApplicationRecord(applicationId, identity);

    if (!existingApp) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, type, status, phase, sortOrder } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) {
      const validTypes = ["summer_intern", "fall_intern", "winter_intern", "early", "main", "other"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "無効なタイプです" },
          { status: 400 }
        );
      }
      updateData.type = type;
    }
    if (status !== undefined) {
      const validStatuses = ["active", "completed", "withdrawn"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "無効なステータスです" },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (phase !== undefined) {
      updateData.phase = JSON.stringify(phase);
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    const updated = await db
      .update(applications)
      .set(updateData)
      .where(eq(applications.id, applicationId))
      .returning();

    return NextResponse.json({
      application: {
        ...updated[0],
        phase: updated[0].phase ? JSON.parse(updated[0].phase) : [],
      },
    });
  } catch (error) {
    console.error("Error updating application:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const appToDelete = await getOwnedApplicationRecord(applicationId, identity);

    if (!appToDelete) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Delete application (cascades to job types, deadlines, etc.)
    await db.delete(applications).where(eq(applications.id, applicationId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting application:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
