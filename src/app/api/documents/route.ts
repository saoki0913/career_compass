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
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

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
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENTS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "documents-auth",
      });
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
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENTS_FETCH_FAILED",
      userMessage: "ドキュメント一覧を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "documents-fetch",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-create-auth",
      });
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { title, type, companyId, applicationId, jobTypeId, content } = body;

    if (!title || !title.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DOCUMENT_TITLE_REQUIRED",
        userMessage: "タイトルを入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Title is required",
        logContext: "document-create-validation",
      });
    }

    const validTypes = ["es", "tips", "company_analysis"];
    if (!type || !validTypes.includes(type)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DOCUMENT_TYPE_INVALID",
        userMessage: "ドキュメント種別を確認して、もう一度お試しください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Invalid document type",
        logContext: "document-create-validation",
      });
    }

    // Verify company access if provided
    if (companyId) {
      const [company] = await db
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
        .limit(1);

      if (!company) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "DOCUMENT_COMPANY_NOT_FOUND",
          userMessage: "関連する企業が見つかりませんでした。",
          action: "企業の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Company not found for document create",
          logContext: "document-create-validation",
        });
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
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_CREATE_FAILED",
      userMessage: "ドキュメントを作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-create",
    });
  }
}
