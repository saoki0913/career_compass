import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity, type RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  interviewConversations,
  interviewDrillAttempts,
  interviewFeedbackHistories,
} from "@/lib/db/schema";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "../../persistence-errors";

type DrillStartBody = {
  weakestTurnId?: string;
  weakestQuestion?: string;
  weakestAnswer?: string;
  weakestAxis?: string;
  originalScore?: number;
  weakestEvidence?: string[];
  originalScores?: Record<string, number>;
  originalFeedbackId?: string | null;
  interviewFormat?: string;
  interviewerType?: string;
  strictnessMode?: string;
};

type UpstreamDrillStartResponse = {
  why_weak?: string;
  improvement_pattern?: string;
  model_rewrite?: string;
  retry_question?: string;
  prompt_version?: string;
};

function trimString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function loadConversation(companyId: string, identity: RequestIdentity) {
  const where = identity.userId
    ? and(
        eq(interviewConversations.companyId, companyId),
        eq(interviewConversations.userId, identity.userId),
      )
    : and(
        eq(interviewConversations.companyId, companyId),
        eq(interviewConversations.guestId, identity.guestId!),
      );
  const rows = await db.select().from(interviewConversations).where(where).limit(1);
  return rows[0] ?? null;
}

async function loadFeedbackHistory(feedbackId: string, identity: RequestIdentity) {
  const where = identity.userId
    ? and(
        eq(interviewFeedbackHistories.id, feedbackId),
        eq(interviewFeedbackHistories.userId, identity.userId),
      )
    : and(
        eq(interviewFeedbackHistories.id, feedbackId),
        eq(interviewFeedbackHistories.guestId, identity.guestId!),
      );
  const rows = await db.select().from(interviewFeedbackHistories).where(where).limit(1);
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

  let body: DrillStartBody = {};
  try {
    body = (await request.json()) as DrillStartBody;
  } catch {
    body = {};
  }

  const weakestTurnId = trimString(body.weakestTurnId, 200);
  const weakestQuestion = trimString(body.weakestQuestion, 4000);
  const weakestAnswer = trimString(body.weakestAnswer, 4000);
  const weakestAxis = trimString(body.weakestAxis, 40);
  const originalScore =
    typeof body.originalScore === "number" && Number.isFinite(body.originalScore)
      ? Math.max(0, Math.min(5, Math.floor(body.originalScore)))
      : null;

  if (!weakestTurnId || !weakestQuestion || !weakestAnswer || !weakestAxis || originalScore === null) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_DRILL_PAYLOAD_INVALID",
      userMessage: "ドリルに必要な情報が不足しています。",
      action: "最終講評画面から、もう一度ドリルを開始してください。",
    });
  }

  let conversation;
  try {
    conversation = await loadConversation(companyId, identity);
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:drill-start",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
  if (!conversation) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "INTERVIEW_CONVERSATION_NOT_FOUND",
      userMessage: "面接対策の会話が見つかりません。",
      action: "面接対策を開始してから、もう一度お試しください。",
    });
  }

  // original feedback (optional — for lineage only)
  let originalFeedback = null;
  if (body.originalFeedbackId) {
    try {
      originalFeedback = await loadFeedbackHistory(body.originalFeedbackId, identity);
    } catch {
      originalFeedback = null;
    }
  }

  // Resolve company summary from conversation materials (best-effort; empty string OK).
  const upstreamPayload = {
    conversation_id: conversation.id,
    weakest_turn_id: weakestTurnId,
    weakest_question: weakestQuestion,
    weakest_answer: weakestAnswer,
    weakest_axis: weakestAxis,
    original_score: originalScore,
    weakest_evidence: Array.isArray(body.weakestEvidence)
      ? body.weakestEvidence.filter((item) => typeof item === "string" && item.trim().length > 0).slice(0, 3)
      : [],
    company_name: "", // filled below
    company_summary: "",
    selected_role: conversation.selectedRole ?? null,
    interview_format:
      trimString(body.interviewFormat, 40) ?? conversation.interviewFormat ?? "standard_behavioral",
    interviewer_type:
      trimString(body.interviewerType, 20) ?? conversation.interviewerType ?? "hr",
    strictness_mode:
      trimString(body.strictnessMode, 20) ?? conversation.strictnessMode ?? "standard",
  } as Record<string, unknown>;

  // Lookup company.name via a light-weight query.
  const { companies } = await import("@/lib/db/schema");
  try {
    const [companyRow] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    upstreamPayload.company_name = companyRow?.name ?? "";
  } catch {
    upstreamPayload.company_name = "";
  }

  const upstream = await fetchFastApiInternal("/api/interview/drill/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(upstreamPayload),
  });

  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => null);
    return createApiErrorResponse(request, {
      status: upstream.status,
      code: "INTERVIEW_DRILL_UPSTREAM_FAILED",
      userMessage:
        typeof detail?.detail === "string"
          ? detail.detail
          : "ドリルの生成に失敗しました。",
      action: "時間をおいて、もう一度お試しください。",
    });
  }

  const upstreamData = (await upstream.json()) as UpstreamDrillStartResponse;

  // Persist the drill attempt. retryAnswer / retryScores / deltaScores / completedAt は
  // drill/score 完了時に UPDATE する。
  const attemptId = crypto.randomUUID();
  const originalScoresRecord =
    body.originalScores && typeof body.originalScores === "object"
      ? Object.fromEntries(
          Object.entries(body.originalScores).filter(([, v]) => typeof v === "number"),
        )
      : null;

  try {
    await db.insert(interviewDrillAttempts).values({
      id: attemptId,
      conversationId: conversation.id,
      userId: identity.userId ?? undefined,
      guestId: identity.guestId ?? undefined,
      companyId,
      originalFeedbackId: originalFeedback?.id ?? null,
      weakestTurnId,
      weakestAxis,
      weakestQuestion,
      weakestAnswer,
      originalScores: originalScoresRecord,
      whyWeak: upstreamData.why_weak ?? null,
      improvementPattern: upstreamData.improvement_pattern ?? null,
      modelRewrite: upstreamData.model_rewrite ?? null,
      retryQuestion: upstreamData.retry_question ?? null,
      retryAnswer: null,
      retryScores: null,
      deltaScores: null,
      promptVersion: upstreamData.prompt_version ?? "unknown",
      createdAt: new Date(),
      completedAt: null,
    });
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:drill-start",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }

  return NextResponse.json({
    attemptId,
    whyWeak: upstreamData.why_weak ?? "",
    improvementPattern: upstreamData.improvement_pattern ?? "",
    modelRewrite: upstreamData.model_rewrite ?? "",
    retryQuestion: upstreamData.retry_question ?? "",
    promptVersion: upstreamData.prompt_version ?? "unknown",
  });
}
