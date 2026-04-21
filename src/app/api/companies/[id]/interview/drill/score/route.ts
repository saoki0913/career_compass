import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity, type RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { companies, interviewDrillAttempts } from "@/lib/db/schema";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../../persistence-errors";

type DrillScoreBody = {
  attemptId?: string;
  retryAnswer?: string;
};

type UpstreamDrillScoreResponse = {
  retry_scores?: Record<string, number>;
  delta_scores?: Record<string, number>;
  rationale?: string;
  prompt_version?: string;
};

const SEVEN_AXES = [
  "company_fit",
  "role_fit",
  "specificity",
  "logic",
  "persuasiveness",
  "consistency",
  "credibility",
] as const;

function trimString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function loadAttempt(attemptId: string, companyId: string, identity: RequestIdentity) {
  const where = identity.userId
    ? and(
        eq(interviewDrillAttempts.id, attemptId),
        eq(interviewDrillAttempts.companyId, companyId),
        eq(interviewDrillAttempts.userId, identity.userId),
      )
    : and(
        eq(interviewDrillAttempts.id, attemptId),
        eq(interviewDrillAttempts.companyId, companyId),
        eq(interviewDrillAttempts.guestId, identity.guestId!),
      );
  const rows = await db.select().from(interviewDrillAttempts).where(where).limit(1);
  return rows[0] ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity?.userId) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "ログインが必要です。",
      action: "ログインしてから、もう一度お試しください。",
    });
  }

  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return limitResponse;

  const { id: companyId } = await params;

  let body: DrillScoreBody = {};
  try {
    body = (await request.json()) as DrillScoreBody;
  } catch {
    body = {};
  }

  const attemptId = trimString(body.attemptId, 200);
  const retryAnswer = trimString(body.retryAnswer, 4000);
  if (!attemptId || !retryAnswer) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_DRILL_SCORE_PAYLOAD_INVALID",
      userMessage: "書き直し回答を入力してから、もう一度お試しください。",
      action: "回答フィールドに内容を入力してください。",
    });
  }

  let attempt;
  try {
    attempt = await loadAttempt(attemptId, companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:drill-score",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
  if (!attempt) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "INTERVIEW_DRILL_ATTEMPT_NOT_FOUND",
      userMessage: "ドリルの記録が見つかりません。",
      action: "最終講評画面から、ドリルを始めからやり直してください。",
    });
  }

  // original_scores が保存されていないケースは 0 で埋めて LLM に渡す
  // (fallback 動作を FastAPI 側の _coerce_retry_scores と揃える)。
  const originalScoresRaw =
    attempt.originalScores && typeof attempt.originalScores === "object"
      ? (attempt.originalScores as Record<string, number>)
      : {};
  const originalScores: Record<string, number> = {};
  for (const axis of SEVEN_AXES) {
    const value = originalScoresRaw[axis];
    originalScores[axis] =
      typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(5, Math.floor(value))) : 0;
  }

  // company name lookup (best-effort)
  let companyName = "";
  try {
    const [companyRow] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    companyName = companyRow?.name ?? "";
  } catch {
    companyName = "";
  }

  const upstreamPayload = {
    conversation_id: attempt.conversationId,
    weakest_turn_id: attempt.weakestTurnId ?? "",
    retry_question: attempt.retryQuestion ?? "",
    retry_answer: retryAnswer,
    original_scores: originalScores,
    weakest_axis: attempt.weakestAxis ?? "",
    company_name: companyName,
    company_summary: "",
    selected_role: null,
  };

  const upstream = await fetchFastApiInternal("/api/interview/drill/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(upstreamPayload),
  });

  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => null);
    return createApiErrorResponse(request, {
      status: upstream.status,
      code: "INTERVIEW_DRILL_SCORE_UPSTREAM_FAILED",
      userMessage:
        typeof detail?.detail === "string"
          ? detail.detail
          : "再採点に失敗しました。",
      action: "時間をおいて、もう一度お試しください。",
    });
  }

  const upstreamData = (await upstream.json()) as UpstreamDrillScoreResponse;
  const retryScores: Record<string, number> = {};
  const deltaScores: Record<string, number> = {};
  for (const axis of SEVEN_AXES) {
    const retryValue = upstreamData.retry_scores?.[axis];
    const upstreamDelta = upstreamData.delta_scores?.[axis];
    retryScores[axis] =
      typeof retryValue === "number" && Number.isFinite(retryValue)
        ? Math.max(0, Math.min(5, Math.floor(retryValue)))
        : 0;
    deltaScores[axis] =
      typeof upstreamDelta === "number" && Number.isFinite(upstreamDelta)
        ? Math.floor(upstreamDelta)
        : retryScores[axis] - originalScores[axis];
  }

  try {
    await db
      .update(interviewDrillAttempts)
      .set({
        retryAnswer,
        retryScores,
        deltaScores,
        completedAt: new Date(),
      })
      .where(eq(interviewDrillAttempts.id, attempt.id));
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:drill-score",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }

  return NextResponse.json({
    attemptId: attempt.id,
    retryScores,
    deltaScores,
    rationale: upstreamData.rationale ?? "",
    promptVersion: upstreamData.prompt_version ?? "unknown",
  });
}
