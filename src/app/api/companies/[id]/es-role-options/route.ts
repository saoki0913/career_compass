import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { companies, documents, jobTypes } from "@/lib/db/schema";
import {
  buildRoleGroups,
  getSelectableIndustryOptions,
  resolveIndustryForReview,
  requiresIndustrySelection,
} from "@/lib/constants/es-review-role-catalog";

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (!deviceToken) {
    return null;
  }

  const guest = await getGuestUser(deviceToken);
  if (!guest) {
    return null;
  }

  return { userId: null, guestId: guest.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: companyId } = await params;
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        userId: companies.userId,
        guestId: companies.guestId,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (
      (identity.userId && company.userId !== identity.userId) ||
      (identity.guestId && company.guestId !== identity.guestId)
    ) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    const industryOverride = searchParams.get("industry");

    let documentRole: string | null = null;
    let applicationRoles: string[] = [];

    if (documentId) {
      const [document] = await db
        .select({
          id: documents.id,
          companyId: documents.companyId,
          jobTypeId: documents.jobTypeId,
          applicationId: documents.applicationId,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (document?.companyId === companyId) {
        if (document.jobTypeId) {
          const [docJobType] = await db
            .select({ name: jobTypes.name })
            .from(jobTypes)
            .where(eq(jobTypes.id, document.jobTypeId))
            .limit(1);
          documentRole = docJobType?.name ?? null;
        }

        if (document.applicationId) {
          const appRoles = await db
            .select({ name: jobTypes.name })
            .from(jobTypes)
            .where(eq(jobTypes.applicationId, document.applicationId))
            .orderBy(asc(jobTypes.sortOrder));
          applicationRoles = appRoles
            .map((role) => role.name?.trim())
            .filter((role): role is string => Boolean(role));
        }
      }
    }

    const resolvedIndustry = resolveIndustryForReview({
      companyName: company.name,
      companyIndustry: company.industry,
      industryOverride,
    });

    const roleGroups = resolvedIndustry
      ? buildRoleGroups({
          industry: resolvedIndustry,
          companyName: company.name,
          documentRole,
          applicationRoles,
        })
      : [];

    return NextResponse.json({
      companyId: company.id,
      companyName: company.name,
      industry: resolvedIndustry,
      requiresIndustrySelection:
        !resolvedIndustry && requiresIndustrySelection(company.industry),
      industryOptions: getSelectableIndustryOptions(company.industry),
      roleGroups,
    });
  } catch (error) {
    console.error("Error building ES review role options:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
