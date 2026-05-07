/**
 * Pins API - Generic favorites/pin management
 *
 * GET: List pinned entity IDs for a given entity type
 * POST: Pin an entity (upsert)
 * DELETE: Unpin an entity
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userPins } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getOwnedDocument, hasValidOwnerIdentity } from "@/bff/identity/owner-access";
import { verifyGakuchikaAccess } from "@/bff/gakuchika/access";
import { logError } from "@/lib/logger";

const VALID_ENTITY_TYPES = ["document", "gakuchika"] as const;
type EntityType = typeof VALID_ENTITY_TYPES[number];

function isValidEntityType(type: string): type is EntityType {
  return VALID_ENTITY_TYPES.includes(type as EntityType);
}

async function isOwnedPinTarget(
  entityType: EntityType,
  entityId: string,
  identity: { userId: string | null; guestId: string | null },
): Promise<boolean> {
  if (entityType === "document") {
    return Boolean(await getOwnedDocument(entityId, identity));
  }

  return verifyGakuchikaAccess(entityId, identity.userId, identity.guestId);
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity || !hasValidOwnerIdentity(identity)) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");

    if (!entityType || !isValidEntityType(entityType)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "INVALID_ENTITY_TYPE",
        userMessage: "ピン留め対象が正しくありません。",
        action: "画面を再読み込みして、もう一度お試しください。",
      });
    }

    const conditions = [eq(userPins.entityType, entityType)];

    if (userId) {
      conditions.push(eq(userPins.userId, userId));
    } else if (guestId) {
      conditions.push(eq(userPins.guestId, guestId));
    }

    const pins = await db
      .select({ entityId: userPins.entityId })
      .from(userPins)
      .where(and(...conditions));

    return NextResponse.json({
      pinnedIds: pins.map((p) => p.entityId),
    });
  } catch (error) {
    logError("pins:get", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "PINS_FETCH_FAILED",
      userMessage: "ピン留めの取得に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity || !hasValidOwnerIdentity(identity)) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { entityType, entityId } = body;

    if (!entityType || !isValidEntityType(entityType)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "INVALID_ENTITY_TYPE",
        userMessage: "ピン留め対象が正しくありません。",
        action: "画面を再読み込みして、もう一度お試しください。",
      });
    }

    if (!entityId || typeof entityId !== "string") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "ENTITY_ID_REQUIRED",
        userMessage: "ピン留め対象を確認できませんでした。",
        action: "画面を再読み込みして、もう一度お試しください。",
      });
    }

    if (!(await isOwnedPinTarget(entityType, entityId, identity))) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "PIN_TARGET_NOT_FOUND",
        userMessage: "ピン留め対象が見つかりません。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }

    // Upsert: insert or do nothing if already exists
    await db
      .insert(userPins)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        entityType,
        entityId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("pins:post", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "PIN_CREATE_FAILED",
      userMessage: "ピン留めに失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
    });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity || !hasValidOwnerIdentity(identity)) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { entityType, entityId } = body;

    if (!entityType || !isValidEntityType(entityType)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "INVALID_ENTITY_TYPE",
        userMessage: "ピン留め対象が正しくありません。",
        action: "画面を再読み込みして、もう一度お試しください。",
      });
    }

    if (!entityId || typeof entityId !== "string") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "ENTITY_ID_REQUIRED",
        userMessage: "ピン留め対象を確認できませんでした。",
        action: "画面を再読み込みして、もう一度お試しください。",
      });
    }

    const conditions = [
      eq(userPins.entityType, entityType),
      eq(userPins.entityId, entityId),
    ];

    if (userId) {
      conditions.push(eq(userPins.userId, userId));
    } else if (guestId) {
      conditions.push(eq(userPins.guestId, guestId));
    }

    await db.delete(userPins).where(and(...conditions));

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("pins:delete", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "PIN_DELETE_FAILED",
      userMessage: "ピン留めの解除に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
    });
  }
}
