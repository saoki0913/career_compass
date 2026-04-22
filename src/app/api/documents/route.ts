/**
 * Documents API
 *
 * GET: List documents
 * POST: Create a new document
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { hasOwnedApplication, hasOwnedCompany, hasOwnedJobType } from "@/app/api/_shared/owner-access";
import { getDocumentsPageData } from "@/lib/server/app-loaders";
import { DEFAULT_ES_DOCUMENT_CATEGORY, esDocumentCategorySchema } from "@/lib/es-document-category";
import { getDefaultBlocksForEsCategory } from "@/lib/es-document-templates";

async function getIdentity(request: NextRequest) {
  return getRequestIdentity(request);
}

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const companyId = searchParams.get("companyId");
    const applicationId = searchParams.get("applicationId");
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const data = await timing.measure("db", () =>
      getDocumentsPageData(identity, {
        type: type as "es" | "tips" | "company_analysis" | undefined,
        companyId,
        applicationId,
        includeDeleted,
        includeContent: false,
      })
    );
    return timing.apply(NextResponse.json(data));
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
    const { title, type, companyId, applicationId, jobTypeId, content, esCategory: rawEsCategory } = body;

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

    let resolvedEsCategory = DEFAULT_ES_DOCUMENT_CATEGORY;
    if (type === "es") {
      if (rawEsCategory !== undefined && rawEsCategory !== null) {
        const parsed = esDocumentCategorySchema.safeParse(rawEsCategory);
        if (!parsed.success) {
          return createApiErrorResponse(request, {
            status: 400,
            code: "DOCUMENT_ES_CATEGORY_INVALID",
            userMessage: "文書の分類を確認して、もう一度お試しください。",
            action: "入力内容を確認して、もう一度お試しください。",
            developerMessage: "Invalid esCategory",
            logContext: "document-create-validation",
          });
        }
        resolvedEsCategory = parsed.data;
      }
    }

    let contentJson: string | null = null;
    if (content !== undefined && content !== null) {
      contentJson = JSON.stringify(content);
    } else if (type === "es") {
      contentJson = JSON.stringify(getDefaultBlocksForEsCategory(resolvedEsCategory));
    }

    // Verify related resource access if provided
    if (companyId) {
      const hasCompany = await hasOwnedCompany(companyId, { userId, guestId });
      if (!hasCompany) {
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

    if (applicationId) {
      const hasApplication = await hasOwnedApplication(applicationId, { userId, guestId });
      if (!hasApplication) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "DOCUMENT_APPLICATION_NOT_FOUND",
          userMessage: "関連する応募情報が見つかりませんでした。",
          action: "応募情報の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Application not found for document create",
          logContext: "document-create-validation",
        });
      }
    }

    if (jobTypeId) {
      const hasJobType = await hasOwnedJobType(jobTypeId, { userId, guestId });
      if (!hasJobType) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "DOCUMENT_JOB_TYPE_NOT_FOUND",
          userMessage: "関連する職種情報が見つかりませんでした。",
          action: "職種の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Job type not found for document create",
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
        esCategory: type === "es" ? resolvedEsCategory : DEFAULT_ES_DOCUMENT_CATEGORY,
        title: title.trim(),
        content: contentJson,
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
