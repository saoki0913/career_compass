/**
 * Gakuchika Detail API
 *
 * GET: Get a single gakuchika
 * PUT: Update a gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireOwnerMutationRequest } from "@/bff/api/mutation-guard";
import {
  buildOwnedRowCondition,
  createOwnedResourceNotFoundResponse,
  requireRequestIdentity,
} from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type GakuchikaDetailDto = {
  id: string;
  title: string;
  content: string | null;
  charLimitType: "300" | "400" | "500" | null;
  summary: string | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function toGakuchikaDetailDto(row: GakuchikaDetailDto): GakuchikaDetailDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    charLimitType: row.charLimitType,
    summary: row.summary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function gakuchikaNotFoundResponse(request: NextRequest) {
  return createOwnedResourceNotFoundResponse(request, {
    code: "GAKUCHIKA_NOT_FOUND",
    userMessage: "対象のガクチカが見つかりませんでした。",
    action: "一覧を再読み込みして、もう一度お試しください。",
    logContext: "gakuchika-detail-not-found",
    developerMessage: "Gakuchika not found for owner",
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_DETAIL",
      logContext: "gakuchika-detail-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const { id } = await params;
    const ownedCondition = buildOwnedRowCondition(
      eq(gakuchikaContents.id, id),
      gakuchikaContents,
      identityResult.identity,
    );
    if (!ownedCondition) {
      return gakuchikaNotFoundResponse(request);
    }

    const [gakuchika] = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        content: gakuchikaContents.content,
        charLimitType: gakuchikaContents.charLimitType,
        summary: gakuchikaContents.summary,
        sortOrder: gakuchikaContents.sortOrder,
        createdAt: gakuchikaContents.createdAt,
        updatedAt: gakuchikaContents.updatedAt,
      })
      .from(gakuchikaContents)
      .where(ownedCondition)
      .limit(1);

    if (!gakuchika) {
      return gakuchikaNotFoundResponse(request);
    }

    return NextResponse.json({
      gakuchika: toGakuchikaDetailDto(gakuchika),
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_DETAIL_FETCH_FAILED",
      userMessage: "ガクチカを読み込めませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-detail",
    });
  }
}

const VALID_CHAR_LIMITS = ["300", "400", "500"] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mutationGuard = requireOwnerMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_UPDATE",
      logContext: "gakuchika-update-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_UPDATE_INVALID_REQUEST",
        userMessage: "更新内容を確認できませんでした。",
        action: "入力内容を確認して、もう一度お試しください。",
      });
    }

    // Build update object with only provided fields
    const updateData: {
      title?: string;
      content?: string;
      charLimitType?: "300" | "400" | "500";
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    // Validate and add title if provided
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "GAKUCHIKA_TITLE_REQUIRED",
          userMessage: "テーマは必須です。",
          action: "テーマを入力して、もう一度お試しください。",
        });
      }
      updateData.title = body.title.trim();
    }

    // Validate and add content if provided
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || !body.content.trim()) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "GAKUCHIKA_CONTENT_REQUIRED",
          userMessage: "ガクチカの内容は必須です。",
          action: "内容を入力して、もう一度お試しください。",
        });
      }

      updateData.content = body.content.trim();
    }

    // Validate and add charLimitType if provided
    if (body.charLimitType !== undefined) {
      if (!VALID_CHAR_LIMITS.includes(body.charLimitType as "300" | "400" | "500")) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "GAKUCHIKA_CHAR_LIMIT_INVALID",
          userMessage: "無効な文字数制限タイプです。",
          action: "文字数を選び直して、もう一度お試しください。",
        });
      }
      updateData.charLimitType = body.charLimitType as "300" | "400" | "500";
    }

    const ownedCondition = buildOwnedRowCondition(
      eq(gakuchikaContents.id, id),
      gakuchikaContents,
      identityResult.identity,
    );
    if (!ownedCondition) {
      return gakuchikaNotFoundResponse(request);
    }

    const updated = await db
      .update(gakuchikaContents)
      .set(updateData)
      .where(ownedCondition)
      .returning({ id: gakuchikaContents.id });

    if (updated.length === 0) {
      return gakuchikaNotFoundResponse(request);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_UPDATE_FAILED",
      userMessage: "ガクチカを更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-update",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mutationGuard = requireOwnerMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_DELETE",
      logContext: "gakuchika-delete-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const { id } = await params;
    const ownedCondition = buildOwnedRowCondition(
      eq(gakuchikaContents.id, id),
      gakuchikaContents,
      identityResult.identity,
    );
    if (!ownedCondition) {
      return gakuchikaNotFoundResponse(request);
    }

    const deleted = await db
      .delete(gakuchikaContents)
      .where(ownedCondition)
      .returning({ id: gakuchikaContents.id });

    if (deleted.length === 0) {
      return gakuchikaNotFoundResponse(request);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_DELETE_FAILED",
      userMessage: "ガクチカを削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-delete",
    });
  }
}
