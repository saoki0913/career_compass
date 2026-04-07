/**
 * Document Detail API
 *
 * GET: Get document details
 * PUT: Update document
 * DELETE: Move to trash (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, documentVersions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getOwnedApplication,
  getOwnedCompany,
  getOwnedDocument,
  hasOwnedApplication,
  hasOwnedCompany,
  hasOwnedJobType,
} from "@/app/api/_shared/owner-access";
import { getDocumentDetailPageData } from "@/lib/server/app-loaders";
import { esDocumentCategorySchema } from "@/lib/es-document-category";

type DocumentRow = typeof documents.$inferSelect;

async function buildDocumentResponse(
  doc: DocumentRow,
  identity: { userId: string | null; guestId: string | null }
) {
  const [company, application] = await Promise.all([
    doc.companyId
      ? getOwnedCompany(doc.companyId, identity)
      : Promise.resolve(null),
    doc.applicationId
      ? getOwnedApplication(doc.applicationId, identity)
      : Promise.resolve(null),
  ]);

  return {
    ...doc,
    content: doc.content ? JSON.parse(doc.content) : null,
    company,
    application,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timing = createServerTimingRecorder();
  try {
    const { id: documentId } = await params;

    const identity = await timing.measure("identity", () => getRequestIdentity(request));
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_DETAIL_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-detail-auth",
      });
    }

    const detail = await timing.measure("db", () =>
      getDocumentDetailPageData(identity, documentId)
    );
    if (!detail) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DOCUMENT_NOT_FOUND",
        userMessage: "ドキュメントが見つかりませんでした。",
        action: "一覧に戻って、対象のドキュメントを選び直してください。",
        developerMessage: "Document not found",
        logContext: "document-detail-not-found",
      });
    }

    return timing.apply(
      NextResponse.json({
        document: detail.document,
      })
    );
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_DETAIL_FETCH_FAILED",
      userMessage: "ドキュメントを読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-detail-fetch",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_UPDATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-update-auth",
      });
    }

    const docRow = await getOwnedDocument(documentId, identity);
    if (!docRow) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DOCUMENT_UPDATE_NOT_FOUND",
        userMessage: "更新対象のドキュメントが見つかりませんでした。",
        action: "一覧に戻って、対象のドキュメントを選び直してください。",
        developerMessage: "Document not found",
        logContext: "document-update-not-found",
      });
    }

    const body = await request.json();
    const { title, content, status, companyId, applicationId, jobTypeId, esCategory: rawEsCategory } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DOCUMENT_TITLE_REQUIRED",
          userMessage: "タイトルを入力してください。",
          action: "入力内容を確認して、もう一度お試しください。",
          developerMessage: "Title is required",
          logContext: "document-update-validation",
        });
      }
      if (trimmedTitle.length > 200) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DOCUMENT_TITLE_TOO_LONG",
          userMessage: "タイトルは200文字以内で入力してください。",
          action: "入力内容を調整して、もう一度お試しください。",
          developerMessage: "Document title too long",
          logContext: "document-update-validation",
        });
      }
      updateData.title = trimmedTitle;
    }

    if (content !== undefined) {
      // Save version before updating (if content changed significantly)
      const oldContent = docRow.content;
      if (oldContent && oldContent !== JSON.stringify(content)) {
        await db.insert(documentVersions).values({
          id: crypto.randomUUID(),
          documentId,
          content: oldContent,
          createdAt: new Date(),
        });

        // Keep only last 5 versions
        const versions = await db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId))
          .orderBy(documentVersions.createdAt);

        if (versions.length > 5) {
          const toDelete = versions.slice(0, versions.length - 5);
          for (const v of toDelete) {
            await db.delete(documentVersions).where(eq(documentVersions.id, v.id));
          }
        }
      }

      updateData.content = JSON.stringify(content);
    }

    if (status !== undefined) {
      const validStatuses = ["draft", "published", "deleted"];
      if (!validStatuses.includes(status)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DOCUMENT_STATUS_INVALID",
          userMessage: "ドキュメントの状態を確認して、もう一度お試しください。",
          action: "入力内容を確認して、もう一度お試しください。",
          developerMessage: "Invalid document status",
          logContext: "document-update-validation",
        });
      }
      updateData.status = status;
      if (status === "deleted") {
        updateData.deletedAt = new Date();
      }
    }

    if (companyId !== undefined) {
      if (companyId) {
        const hasCompany = await hasOwnedCompany(companyId, identity);
        if (!hasCompany) {
          return createApiErrorResponse(request, {
            status: 404,
            code: "DOCUMENT_COMPANY_NOT_FOUND",
            userMessage: "関連する企業が見つかりませんでした。",
            action: "企業の選択内容を確認して、もう一度お試しください。",
            developerMessage: "Company not found for document update",
            logContext: "document-update-validation",
          });
        }
      }
      updateData.companyId = companyId || null;
    }

    if (applicationId !== undefined) {
      if (applicationId) {
        const hasApplication = await hasOwnedApplication(applicationId, identity);
        if (!hasApplication) {
          return createApiErrorResponse(request, {
            status: 404,
            code: "DOCUMENT_APPLICATION_NOT_FOUND",
            userMessage: "関連する応募情報が見つかりませんでした。",
            action: "応募情報の選択内容を確認して、もう一度お試しください。",
            developerMessage: "Application not found for document update",
            logContext: "document-update-validation",
          });
        }
      }
      updateData.applicationId = applicationId || null;
    }

    if (jobTypeId !== undefined) {
      if (jobTypeId) {
        const hasJobType = await hasOwnedJobType(jobTypeId, identity);
        if (!hasJobType) {
          return createApiErrorResponse(request, {
            status: 404,
            code: "DOCUMENT_JOB_TYPE_NOT_FOUND",
            userMessage: "関連する職種情報が見つかりませんでした。",
            action: "職種の選択内容を確認して、もう一度お試しください。",
            developerMessage: "Job type not found for document update",
            logContext: "document-update-validation",
          });
        }
      }
      updateData.jobTypeId = jobTypeId || null;
    }

    if (rawEsCategory !== undefined) {
      if (docRow.type !== "es") {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DOCUMENT_ES_CATEGORY_NOT_APPLICABLE",
          userMessage: "このドキュメントでは分類を変更できません。",
          action: "別のドキュメントを選び直してください。",
          developerMessage: "esCategory only for type es",
          logContext: "document-update-validation",
        });
      }
      const parsed = esDocumentCategorySchema.safeParse(rawEsCategory);
      if (!parsed.success) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DOCUMENT_ES_CATEGORY_INVALID",
          userMessage: "文書の分類を確認して、もう一度お試しください。",
          action: "入力内容を確認して、もう一度お試しください。",
          developerMessage: "Invalid esCategory",
          logContext: "document-update-validation",
        });
      }
      updateData.esCategory = parsed.data;
    }

    const updated = await db
      .update(documents)
      .set(updateData)
      .where(eq(documents.id, documentId))
      .returning();

    return NextResponse.json({
      document: await buildDocumentResponse(updated[0], identity),
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_UPDATE_FAILED",
      userMessage: "ドキュメントを更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-update",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-delete-auth",
      });
    }

    const docForDelete = await getOwnedDocument(documentId, identity);
    if (!docForDelete) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DOCUMENT_DELETE_NOT_FOUND",
        userMessage: "削除対象のドキュメントが見つかりませんでした。",
        action: "一覧に戻って、対象のドキュメントを選び直してください。",
        developerMessage: "Document not found",
        logContext: "document-delete-not-found",
      });
    }

    // Soft delete - move to trash
    await db
      .update(documents)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_DELETE_FAILED",
      userMessage: "ドキュメントを削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-delete",
    });
  }
}
