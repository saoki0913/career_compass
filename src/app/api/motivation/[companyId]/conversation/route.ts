/**
 * Motivation Conversation API
 *
 * GET: Get conversation history
 * DELETE: Reset conversation
 *
 * 回答送信は `conversation/stream`（SSE）のみ。
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/logger";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  safeParseConversationContext as parseConversationContext,
  safeParseEvidenceCards as parseEvidenceCards,
  safeParseMessages as parseMessages,
  safeParseScores as parseScores,
  resolveDraftReadyState,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { buildMotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import {
  buildMotivationOwnerCondition,
  ensureMotivationConversation,
  fetchMotivationApplicationJobCandidates,
  getOwnedMotivationCompanyData,
  isMotivationSetupComplete,
  resolveMotivationInputs,
} from "@/lib/motivation/motivation-input-resolver";

// GET: Fetch conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    if (!identity.userId) {
      return NextResponse.json(
        { error: "志望動機のAI支援はログインが必要です" },
        { status: 401 },
      );
    }

    const { userId, guestId } = identity;
    const ownerCondition = buildMotivationOwnerCondition(companyId, userId, guestId);
    const company = await getOwnedMotivationCompanyData(companyId, identity);

    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    const conversation =
      await ensureMotivationConversation(companyId, userId, guestId)
      ?? await getConversationByCondition(ownerCondition);

    if (!conversation) {
      return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
    }

    const messages = parseMessages(conversation.messages);
    const scores = parseScores(conversation.motivationScores);
    const initialConversationContext = parseConversationContext(conversation.conversationContext);
    const { isDraftReady } = resolveDraftReadyState(
      initialConversationContext,
      conversation.status as "in_progress" | "completed" | null,
    );
    const evidenceCardsFromDb = parseEvidenceCards(conversation.lastEvidenceCards);
    let applicationJobCandidates: string[] = [];
    try {
      applicationJobCandidates = await fetchMotivationApplicationJobCandidates(companyId, userId, guestId);
    } catch (error) {
      logError("get-motivation-conversation:application-job-candidates", error, {
        companyId,
        userId: userId ?? undefined,
        guestId: guestId ?? undefined,
      });
    }
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      initialConversationContext,
      applicationJobCandidates,
    );
    const conversationContext = resolvedInputs.conversationContext;
    const setupComplete = isMotivationSetupComplete(
      conversationContext,
      resolvedInputs.requiresIndustrySelection,
    );
    const payload = buildMotivationConversationPayload({
      messages,
      questionCount: conversation.questionCount ?? 0,
      isDraftReady,
      generatedDraft: conversation.generatedDraft,
      scores,
      conversationContext,
      persistedQuestionStage: (conversation.questionStage as typeof conversationContext.questionStage | null) ?? null,
      stageStatusValue: conversation.stageStatus,
      evidenceCards: evidenceCardsFromDb,
      coachingFocus: null,
      riskFlags: [],
      resolvedIndustry: resolvedInputs.company.industry,
      requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
      isSetupComplete: setupComplete,
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: conversation.questionCount,
        status: conversation.status,
      },
      ...payload,
    });
  } catch (error) {
    logError("get-motivation-conversation", error);
    return NextResponse.json(
      { error: "会話データの取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}

// DELETE: Reset conversation history
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  const conversation = await getConversationByCondition(
    buildMotivationOwnerCondition(companyId, userId, guestId)
  );

  if (!conversation) {
    return NextResponse.json({ success: true, reset: false });
  }

  await db
    .update(motivationConversations)
    .set({
      messages: [] as unknown[],
      questionCount: 0,
      status: "in_progress" as const,
      motivationScores: null,
      generatedDraft: null,
      charLimitType: null,
      conversationContext: null,
      selectedRole: null,
      selectedRoleSource: null,
      desiredWork: null,
      questionStage: null,
      lastEvidenceCards: null,
      stageStatus: null,
      updatedAt: new Date(),
    })
    .where(eq(motivationConversations.id, conversation.id));

  return NextResponse.json({ success: true, reset: true });
}
