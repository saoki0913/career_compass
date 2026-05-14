/**
 * Gakuchika Reorder API
 *
 * PATCH: Update sort order for gakuchika materials
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireOwnerMutationRequest } from "@/bff/api/mutation-guard";
import {
  buildOwnedRowCondition,
  buildOwnerCondition,
  createOwnedResourceNotFoundResponse,
  requireRequestIdentity,
} from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";

function reorderNotFoundResponse(request: NextRequest) {
  return createOwnedResourceNotFoundResponse(request, {
    code: "GAKUCHIKA_REORDER_NOT_FOUND",
    userMessage: "並び替え対象のガクチカが見つかりませんでした。",
    action: "一覧を再読み込みして、もう一度お試しください。",
    logContext: "gakuchika-reorder-not-found",
    developerMessage: "One or more gakuchika rows were not found for owner",
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const mutationGuard = requireOwnerMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_REORDER",
      logContext: "gakuchika-reorder-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const orderedIds = body?.orderedIds;

    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      !orderedIds.every((id) => typeof id === "string" && id.trim().length > 0)
    ) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_REORDER_INVALID_REQUEST",
        userMessage: "並び替え対象を確認できませんでした。",
        action: "一覧を再読み込みして、もう一度お試しください。",
      });
    }

    const uniqueIds = Array.from(new Set(orderedIds));
    if (uniqueIds.length !== orderedIds.length) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_REORDER_DUPLICATE_ID",
        userMessage: "同じガクチカが重複して指定されています。",
        action: "一覧を再読み込みして、もう一度お試しください。",
      });
    }

    const ownerCondition = buildOwnerCondition(gakuchikaContents, identity);
    if (!ownerCondition) {
      return reorderNotFoundResponse(request);
    }

    // Verify all IDs belong to the requesting user
    const gakuchikas = await db
      .select({ id: gakuchikaContents.id })
      .from(gakuchikaContents)
      .where(
        and(
          inArray(gakuchikaContents.id, orderedIds),
          ownerCondition,
        )
      );

    if (gakuchikas.length !== orderedIds.length) {
      return reorderNotFoundResponse(request);
    }

    // Update sortOrder for each ID based on index
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        const condition = buildOwnedRowCondition(eq(gakuchikaContents.id, id), gakuchikaContents, identity);
        if (!condition) {
          throw new Error("owner condition unavailable");
        }
        const updated = await tx
          .update(gakuchikaContents)
          .set({
            sortOrder: index,
            updatedAt: now,
          })
          .where(condition)
          .returning({ id: gakuchikaContents.id });
        if (updated.length !== 1) {
          throw new Error("owned reorder update failed");
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_REORDER_FAILED",
      userMessage: "ガクチカの並び替えを保存できませんでした。",
      action: "一覧を再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-reorder",
    });
  }
}
