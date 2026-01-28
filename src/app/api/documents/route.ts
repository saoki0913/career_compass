/**
 * Documents API
 *
 * GET: List documents
 * POST: Create a new document
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, companies, applications } from "@/lib/db/schema";
import { eq, and, desc, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  es: "エントリーシート",
  tips: "就活TIPS",
  company_analysis: "企業分析",
};

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

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const companyId = searchParams.get("companyId");
    const applicationId = searchParams.get("applicationId");
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    // Build where clause
    const conditions = [];

    if (userId) {
      conditions.push(eq(documents.userId, userId));
    } else if (guestId) {
      conditions.push(eq(documents.guestId, guestId));
    }

    if (type) {
      conditions.push(eq(documents.type, type as "es" | "tips" | "company_analysis"));
    }

    if (companyId) {
      conditions.push(eq(documents.companyId, companyId));
    }

    if (applicationId) {
      conditions.push(eq(documents.applicationId, applicationId));
    }

    if (!includeDeleted) {
      conditions.push(ne(documents.status, "deleted"));
    }

    const documentList = await db
      .select({
        document: documents,
        company: {
          id: companies.id,
          name: companies.name,
        },
        application: {
          id: applications.id,
          name: applications.name,
        },
      })
      .from(documents)
      .leftJoin(companies, eq(documents.companyId, companies.id))
      .leftJoin(applications, eq(documents.applicationId, applications.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.updatedAt));

    return NextResponse.json({
      documents: documentList.map((d) => ({
        ...d.document,
        company: d.company?.id ? d.company : null,
        application: d.application?.id ? d.application : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { title, type, companyId, applicationId, jobTypeId, content } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    const validTypes = ["es", "tips", "company_analysis"];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: "有効なタイプを選択してください" },
        { status: 400 }
      );
    }

    // Verify company access if provided
    if (companyId) {
      const company = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, companyId),
            userId
              ? eq(companies.userId, userId)
              : guestId
              ? eq(companies.guestId, guestId)
              : isNull(companies.id)
          )
        )
        .get();

      if (!company) {
        return NextResponse.json(
          { error: "企業が見つかりません" },
          { status: 404 }
        );
      }
    }

    const now = new Date();
    const newDocument = await db
      .insert(documents)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        companyId: companyId || null,
        applicationId: applicationId || null,
        jobTypeId: jobTypeId || null,
        type,
        title: title.trim(),
        content: content ? JSON.stringify(content) : null,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ document: newDocument[0] });
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
