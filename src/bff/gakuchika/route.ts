/**
 * Gakuchika API
 *
 * GET: List gakuchika contents
 * POST: Create a new gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireOwnerMutationRequest } from "@/bff/api/mutation-guard";
import {
  buildOwnerCondition,
  requireRequestIdentity,
} from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { gakuchikaContents, userProfiles } from "@/lib/db/schema";
import { eq, desc, asc, count } from "drizzle-orm";
import { PLAN_METADATA, type PlanTypeWithGuest } from "@/lib/billing/plan-metadata";
import {
  getGakuchikaSummaryKind,
  getGakuchikaSummaryPreview,
} from "@/lib/gakuchika/summary";
import { safeParseConversationState } from "@/bff/gakuchika";
import {
  loadLatestGakuchikaConversationsForOwnedContentIds,
  type LatestOwnedGakuchikaConversation,
} from "@/bff/gakuchika/latest-conversations";

export type GakuchikaListConversationStatus = "in_progress" | "completed" | null;
type LatestGakuchikaConversation = LatestOwnedGakuchikaConversation;

type GakuchikaResponseDto = {
  id: string;
  title: string;
  content: string | null;
  charLimitType: "300" | "400" | "500" | null;
  summary: string | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type GakuchikaListRow = GakuchikaResponseDto;

function toGakuchikaResponseDto(row: GakuchikaResponseDto): GakuchikaResponseDto {
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

function toGakuchikaListDto(
  row: GakuchikaListRow,
  latest: LatestGakuchikaConversation | undefined,
) {
  const rawStatus = latest?.status ?? null;
  const qCount = Number(latest?.questionCount ?? 0);
  const conversationStatus = normalizeGakuchikaListConversationStatus(rawStatus, qCount);

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    conversationStatus,
    conversationState: safeParseConversationState(
      latest?.starScores ?? null,
      conversationStatus,
    ),
    questionCount: qCount,
    summaryKind: getGakuchikaSummaryKind(row.summary),
    summaryPreview: getGakuchikaSummaryPreview(row.summary),
  };
}

/** DB 由来の生値を一覧 API 用に正規化。質問済みなのに status が取れない行は in_progress に寄せる。 */
export function normalizeGakuchikaListConversationStatus(
  raw: unknown,
  questionCount: number,
): GakuchikaListConversationStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "in_progress" || s === "completed") {
    return s;
  }
  if (questionCount > 0) {
    return "in_progress";
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_LIST",
      logContext: "gakuchika-list-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const identity = identityResult.identity;
    const { userId } = identity;
    const ownerCondition = buildOwnerCondition(gakuchikaContents, identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "GAKUCHIKA_LIST_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Valid owner identity is required",
      });
    }

    // Get user plan
    let plan: PlanTypeWithGuest = "guest";
    if (userId) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      plan = (profile?.plan || "free") as PlanTypeWithGuest;
    }

    const contents = await db
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
      .where(ownerCondition)
      .orderBy(asc(gakuchikaContents.sortOrder), desc(gakuchikaContents.updatedAt));

    const contentIds = contents.map((row) => row.id);
    const convRows = await loadLatestGakuchikaConversationsForOwnedContentIds(contentIds);
    const latestConvByGakuchikaId = new Map(convRows.map((row) => [row.gakuchikaId, row]));
    const gakuchikasWithConversation = contents.map((gakuchika) =>
      toGakuchikaListDto(gakuchika, latestConvByGakuchikaId.get(gakuchika.id)),
    );

    const currentCount = contents.length;
    const maxCount = PLAN_METADATA[plan].gakuchika;

    return NextResponse.json({
      gakuchikas: gakuchikasWithConversation,
      currentCount,
      maxCount,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_LIST_FETCH_FAILED",
      userMessage: "ガクチカ一覧を読み込めませんでした。",
      action: "時間を置いて、もう一度読み込んでください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-list",
    });
  }
}

const VALID_CHAR_LIMITS = ["300", "400", "500"] as const;
type ValidCharLimit = (typeof VALID_CHAR_LIMITS)[number];

function parseCharLimitType(value: unknown): ValidCharLimit {
  return VALID_CHAR_LIMITS.includes(value as ValidCharLimit)
    ? (value as ValidCharLimit)
    : "400";
}

export async function POST(request: NextRequest) {
  try {
    const mutationGuard = requireOwnerMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "GAKUCHIKA_CREATE",
      logContext: "gakuchika-create-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const identity = identityResult.identity;
    const { userId, guestId } = identity;
    const ownerCondition = buildOwnerCondition(gakuchikaContents, identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "GAKUCHIKA_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Valid owner identity is required",
      });
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!title) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_TITLE_REQUIRED",
        userMessage: "テーマは必須です。",
        action: "テーマを入力して、もう一度お試しください。",
      });
    }

    if (!content) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_CONTENT_REQUIRED",
        userMessage: "ガクチカの内容は必須です。",
        action: "内容を入力して、もう一度お試しください。",
      });
    }

    // Get user plan
    let plan: PlanTypeWithGuest = "guest";
    if (userId) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      plan = (profile?.plan || "free") as PlanTypeWithGuest;
    }

    // Check plan limits
    const maxGakuchika = PLAN_METADATA[plan].gakuchika;
    const [existingCount] = await db
      .select({ count: count() })
      .from(gakuchikaContents)
      .where(ownerCondition);
    const existingCountValue = Number(existingCount?.count ?? 0);

    if (existingCountValue >= maxGakuchika) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "GAKUCHIKA_LIMIT_REACHED",
        userMessage: `ガクチカ素材の作成上限（${maxGakuchika}件）に達しています。`,
        action: "プランをアップグレードするか、既存の素材を整理してください。",
      });
    }

    const validCharLimitType = parseCharLimitType(body?.charLimitType);

    const now = new Date();
    const [newGakuchika] = await db
      .insert(gakuchikaContents)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        title,
        content,
        charLimitType: validCharLimitType,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ gakuchika: toGakuchikaResponseDto(newGakuchika) });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_CREATE_FAILED",
      userMessage: "ガクチカを作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-create",
    });
  }
}
