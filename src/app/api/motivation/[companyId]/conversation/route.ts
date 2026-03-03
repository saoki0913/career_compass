/**
 * Motivation Conversation API
 *
 * GET: Get conversation history
 * POST: Send answer and get next question
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  motivationConversations,
  companies,
  gakuchikaContents,
  gakuchikaConversations,
  userProfiles,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";

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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

interface MotivationEvaluation {
  scores: MotivationScores;
  weakest_element: string;
  is_complete: boolean;
  missing_aspects?: Record<string, string[]>;
  hidden_eval?: Record<string, number>;
  risk_flags?: string[];
}

interface SuggestionOption {
  id: string;
  label: string;
  sourceType: "company" | "gakuchika" | "profile" | "hybrid" | "generic";
  intent:
    | "industry_reason"
    | "company_reason"
    | "role_selection"
    | "desired_work"
    | "fit_connection"
    | "differentiation"
    | "closing";
}

interface MotivationConversationContext {
  industryReason?: string;
  companyReason?: string;
  selectedRole?: string;
  selectedRoleSource?: "profile" | "company_doc" | "application_job_type" | "user_free_text";
  desiredWork?: string;
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  questionStage:
    | "industry_reason"
    | "company_reason"
    | "role_selection"
    | "desired_work"
    | "fit_connection"
    | "differentiation"
    | "closing";
}

interface ProfileContext {
  university: string | null;
  faculty: string | null;
  graduation_year: number | null;
  target_industries: string[];
  target_job_types: string[];
}

function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string; id?: string } =>
        m && typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
      )
      .map(m => ({
        id: m.id || crypto.randomUUID(),
        role: m.role as "user" | "assistant",
        content: m.content
      }));
  } catch {
    return [];
  }
}

function safeParseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function safeParseSuggestionOptions(json: string | null): SuggestionOption[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SuggestionOption =>
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.label === "string" &&
      typeof item.sourceType === "string" &&
      typeof item.intent === "string"
    );
  } catch {
    return [];
  }
}

function safeParseConversationContext(json: string | null): MotivationConversationContext {
  if (!json) {
    return {
      userAnchorStrengths: [],
      userAnchorEpisodes: [],
      profileAnchorIndustries: [],
      profileAnchorJobTypes: [],
      companyAnchorKeywords: [],
      companyRoleCandidates: [],
      companyWorkCandidates: [],
      questionStage: "industry_reason",
    };
  }

  try {
    const parsed = JSON.parse(json);
    return {
      industryReason: typeof parsed.industryReason === "string" ? parsed.industryReason : undefined,
      companyReason: typeof parsed.companyReason === "string" ? parsed.companyReason : undefined,
      selectedRole: typeof parsed.selectedRole === "string" ? parsed.selectedRole : undefined,
      selectedRoleSource: typeof parsed.selectedRoleSource === "string" ? parsed.selectedRoleSource : undefined,
      desiredWork: typeof parsed.desiredWork === "string" ? parsed.desiredWork : undefined,
      userAnchorStrengths: Array.isArray(parsed.userAnchorStrengths) ? parsed.userAnchorStrengths.filter((v: unknown): v is string => typeof v === "string") : [],
      userAnchorEpisodes: Array.isArray(parsed.userAnchorEpisodes) ? parsed.userAnchorEpisodes.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorIndustries: Array.isArray(parsed.profileAnchorIndustries) ? parsed.profileAnchorIndustries.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorJobTypes: Array.isArray(parsed.profileAnchorJobTypes) ? parsed.profileAnchorJobTypes.filter((v: unknown): v is string => typeof v === "string") : [],
      companyAnchorKeywords: Array.isArray(parsed.companyAnchorKeywords) ? parsed.companyAnchorKeywords.filter((v: unknown): v is string => typeof v === "string") : [],
      companyRoleCandidates: Array.isArray(parsed.companyRoleCandidates) ? parsed.companyRoleCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      companyWorkCandidates: Array.isArray(parsed.companyWorkCandidates) ? parsed.companyWorkCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      questionStage: typeof parsed.questionStage === "string" ? parsed.questionStage : "industry_reason",
    };
  } catch {
    return {
      userAnchorStrengths: [],
      userAnchorEpisodes: [],
      profileAnchorIndustries: [],
      profileAnchorJobTypes: [],
      companyAnchorKeywords: [],
      companyRoleCandidates: [],
      companyWorkCandidates: [],
      questionStage: "industry_reason",
    };
  }
}

function safeParseScores(json: string | null): MotivationScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      company_understanding: parsed.company_understanding ?? 0,
      self_analysis: parsed.self_analysis ?? 0,
      career_vision: parsed.career_vision ?? 0,
      differentiation: parsed.differentiation ?? 0,
    };
  } catch {
    return null;
  }
}

interface GakuchikaContextItem {
  title: string;
  strengths: Array<{ title: string; description?: string } | string>;
  action_text?: string;
  result_text?: string;
  numbers?: string[];
}

async function fetchGakuchikaContext(userId: string): Promise<GakuchikaContextItem[]> {
  try {
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
      })
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .orderBy(desc(gakuchikaContents.updatedAt));

    const results: GakuchikaContextItem[] = [];

    for (const content of contents) {
      if (results.length >= 3) break;

      // Check if this gakuchika has a completed conversation
      const [latestConv] = await db
        .select({ status: gakuchikaConversations.status })
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, content.id))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1);

      if (latestConv?.status !== "completed") continue;
      if (!content.summary) continue;

      try {
        const parsed = JSON.parse(content.summary);
        if (typeof parsed !== "object") continue;

        results.push({
          title: content.title,
          strengths: parsed.strengths || [],
          action_text: parsed.action_text || "",
          result_text: parsed.result_text || "",
          numbers: parsed.numbers || [],
        });
      } catch {
        // Skip unparseable summaries
      }
    }

    return results;
  } catch (error) {
    console.error("[Motivation] Failed to fetch gakuchika context:", error);
    return [];
  }
}

// Configuration
const ELEMENT_COMPLETION_THRESHOLD = 70;
const QUESTIONS_PER_CREDIT = 5;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  evaluation?: MotivationEvaluation;
  target_element?: string;
  company_insight?: string;
  suggestions?: string[];
  suggestion_options?: SuggestionOption[];
  evidence_summary?: string;
  coaching_focus?: string;
  risk_flags?: string[];
  question_stage?: MotivationConversationContext["questionStage"];
  captured_context?: Partial<MotivationConversationContext>;
}

interface CompanyData {
  id: string;
  name: string;
  industry: string | null;
}

async function fetchProfileContext(userId: string | null): Promise<ProfileContext | null> {
  if (!userId) return null;
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile) return null;

  return {
    university: profile.university || null,
    faculty: profile.faculty || null,
    graduation_year: profile.graduationYear || null,
    target_industries: profile.targetIndustries ? JSON.parse(profile.targetIndustries) : [],
    target_job_types: profile.targetJobTypes ? JSON.parse(profile.targetJobTypes) : [],
  };
}

function applyAnswerToConversationContext(
  context: MotivationConversationContext,
  answer: string,
  profileContext: ProfileContext | null,
): MotivationConversationContext {
  const next = { ...context };
  const trimmed = answer.trim();
  switch (context.questionStage) {
    case "industry_reason":
      next.industryReason = trimmed;
      break;
    case "company_reason":
      next.companyReason = trimmed;
      break;
    case "role_selection":
      next.selectedRole = trimmed;
      next.selectedRoleSource = profileContext?.target_job_types.includes(trimmed) ? "profile" : "user_free_text";
      break;
    case "desired_work":
      next.desiredWork = trimmed;
      break;
    default:
      break;
  }
  return next;
}

async function getQuestionFromFastAPI(
  company: CompanyData,
  conversationHistory: Message[],
  questionCount: number,
  scores?: MotivationScores | null,
  gakuchikaContext?: GakuchikaContextItem[],
  conversationContext?: MotivationConversationContext,
  profileContext?: ProfileContext | null,
): Promise<{
  question: string | null;
  error: string | null;
  evaluation: MotivationEvaluation | null;
  suggestions: string[];
  suggestionOptions: SuggestionOption[];
  evidenceSummary: string | null;
  coachingFocus: string | null;
  riskFlags: string[];
  questionStage: MotivationConversationContext["questionStage"] | null;
  capturedContext: Partial<MotivationConversationContext> | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${FASTAPI_URL}/api/motivation/next-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        conversation_history: conversationHistory.map(m => ({
          role: m.role,
          content: m.content,
        })),
        question_count: questionCount,
        scores: scores,
        gakuchika_context: gakuchikaContext && gakuchikaContext.length > 0 ? gakuchikaContext : null,
        conversation_context: conversationContext,
        profile_context: profileContext,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        question: null,
        error: errorData.detail?.error || "AIサービスに接続できませんでした",
        evaluation: null,
        suggestions: [],
        suggestionOptions: [],
        evidenceSummary: null,
        coachingFocus: null,
        riskFlags: [],
        questionStage: null,
        capturedContext: null,
      };
    }

    const data: FastAPIQuestionResponse = await response.json();
    return {
      question: data.question,
      error: null,
      evaluation: data.evaluation || null,
      suggestions: data.suggestions || [],
      suggestionOptions: data.suggestion_options || [],
      evidenceSummary: data.evidence_summary || null,
      coachingFocus: data.coaching_focus || null,
      riskFlags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
      questionStage: data.question_stage || null,
      capturedContext: data.captured_context || null,
    };
  } catch (error) {
    console.error("[Motivation] FastAPI error:", error);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        question: null,
        error: "AIの応答がタイムアウトしました",
        evaluation: null,
        suggestions: [],
        suggestionOptions: [],
        evidenceSummary: null,
        coachingFocus: null,
        riskFlags: [],
        questionStage: null,
        capturedContext: null,
      };
    }
    return {
      question: null,
      error: "AIサービスに接続できませんでした",
      evaluation: null,
      suggestions: [],
      suggestionOptions: [],
      evidenceSummary: null,
      coachingFocus: null,
      riskFlags: [],
      questionStage: null,
      capturedContext: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// GET: Fetch conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  // Get company
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Find or create conversation
  let conversation = (await db
    .select()
    .from(motivationConversations)
    .where(
      userId
        ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
        : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
    )
    .limit(1))[0];

  if (!conversation) {
    // Create new conversation
    const newId = crypto.randomUUID();
    const now = new Date();

    await db.insert(motivationConversations).values({
      id: newId,
      userId,
      guestId,
      companyId,
      messages: "[]",
      questionCount: 0,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    });

    conversation = (await db
      .select()
      .from(motivationConversations)
      .where(eq(motivationConversations.id, newId))
      .limit(1))[0];
  }

  if (!conversation) {
    return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
  }

  const messages = safeParseMessages(conversation.messages);
  const scores = safeParseScores(conversation.motivationScores);
  const isCompleted = conversation.status === "completed";
  const conversationContext = safeParseConversationContext(conversation.conversationContext);
  const suggestionOptionsFromDb = safeParseSuggestionOptions(conversation.lastSuggestionOptions);
  const profileContext = await fetchProfileContext(userId);

  // Get next question if not completed
  let nextQuestion: string | null = null;
  let suggestions: string[] = [];
  let suggestionOptions: SuggestionOption[] = [];
  let evidenceSummary: string | null = null;
  let coachingFocus: string | null = null;
  let riskFlags: string[] = [];
  let initError: string | null = null;

  if (!isCompleted) {
    if (messages.length === 0) {
      // Fetch gakuchika context for personalization
      const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];

      // New conversation: fetch initial question from FastAPI
      const result = await getQuestionFromFastAPI(
        { id: company.id, name: company.name, industry: company.industry },
        [],
        0,
        undefined,
        gakuchikaContext,
        conversationContext,
        profileContext,
      );
      nextQuestion = result.question;
      suggestions = result.suggestions;
      suggestionOptions = result.suggestionOptions;
      evidenceSummary = result.evidenceSummary;
      coachingFocus = result.coachingFocus;
      riskFlags = result.riskFlags;
      initError = result.error;
    } else {
      // Existing conversation: extract nextQuestion from last assistant message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === "assistant") {
        nextQuestion = lastMessage.content;
      }
      // Restore saved suggestions from DB
      suggestions = safeParseStringArray(conversation.lastSuggestions);
      suggestionOptions = suggestionOptionsFromDb;
    }
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      questionCount: conversation.questionCount,
      status: conversation.status,
    },
    messages,
    nextQuestion,
    suggestions,
    suggestionOptions,
    questionCount: conversation.questionCount ?? 0,
    isCompleted,
    scores,
    evidenceSummary,
    coachingFocus,
    riskFlags,
    generatedDraft: conversation.generatedDraft,
    conversationContext,
    questionStage: conversation.questionStage || conversationContext.questionStage,
    error: initError,
  });
}

// POST: Send answer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  const body = await request.json();
  const { answer } = body;

  if (!answer || typeof answer !== "string" || !answer.trim()) {
    return NextResponse.json({ error: "回答を入力してください" }, { status: 400 });
  }

  // Get company
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Get conversation
  const [conversation] = await db
    .select()
    .from(motivationConversations)
    .where(
      userId
        ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
        : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
    )
    .limit(1);

  if (!conversation) {
    return NextResponse.json({ error: "会話が見つかりません" }, { status: 404 });
  }

  if (conversation.status === "completed") {
    return NextResponse.json({ error: "この会話は既に完了しています" }, { status: 400 });
  }

  const messages = safeParseMessages(conversation.messages);
  const currentQuestionCount = conversation.questionCount ?? 0;
  const newQuestionCount = currentQuestionCount + 1;
  const profileContext = await fetchProfileContext(userId);
  const conversationContext = applyAnswerToConversationContext(
    safeParseConversationContext(conversation.conversationContext),
    answer.trim(),
    profileContext,
  );

  // Credit check (every QUESTIONS_PER_CREDIT questions for logged-in users)
  // Only check availability here; consume after FastAPI success
  const shouldConsumeCredit = newQuestionCount > 0 && newQuestionCount % QUESTIONS_PER_CREDIT === 0 && !!userId;
  if (shouldConsumeCredit) {
    const canPay = await hasEnoughCredits(userId!, 1);
    if (!canPay) {
      return NextResponse.json({ error: "クレジットが不足しています" }, { status: 402 });
    }
  }

  // Add user answer
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: answer.trim(),
  };
  messages.push(userMessage);

  // Fetch gakuchika context for personalization
  const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];

  // Get next question from FastAPI
  const scores = safeParseScores(conversation.motivationScores);
  const result = await getQuestionFromFastAPI(
    { id: company.id, name: company.name, industry: company.industry },
    messages,
    newQuestionCount,
    scores,
    gakuchikaContext,
    conversationContext,
    profileContext,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  // Consume credit only after FastAPI success (business rule: charge on success only)
  if (shouldConsumeCredit) {
    await consumeCredits(userId!, 1, "motivation", companyId);
  }

  // Add AI question to messages for DB storage
  let isCompleted = false;
  let newScores = scores;

  if (result.question) {
    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.question,
    };
    messages.push(aiMessage);
  }

  if (result.evaluation) {
    newScores = result.evaluation.scores;
    isCompleted = result.evaluation.is_complete;
  }

  // Check completion (8+ questions or all elements >= threshold)
  if (newQuestionCount >= 8 && newScores) {
    const allComplete =
      newScores.company_understanding >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.self_analysis >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.career_vision >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.differentiation >= ELEMENT_COMPLETION_THRESHOLD;
    if (allComplete) {
      isCompleted = true;
    }
  }

  // Update database
  await db
    .update(motivationConversations)
    .set({
      messages: JSON.stringify(messages),
      questionCount: newQuestionCount,
      status: isCompleted ? "completed" : "in_progress",
      motivationScores: newScores ? JSON.stringify(newScores) : null,
      conversationContext: JSON.stringify({
        ...conversationContext,
        ...(result.capturedContext || {}),
      }),
      selectedRole:
        (result.capturedContext?.selectedRole as string | undefined) ??
        conversationContext.selectedRole ??
        null,
      selectedRoleSource:
        (result.capturedContext?.selectedRoleSource as string | undefined) ??
        conversationContext.selectedRoleSource ??
        null,
      desiredWork:
        (result.capturedContext?.desiredWork as string | undefined) ??
        conversationContext.desiredWork ??
        null,
      questionStage: result.questionStage ?? conversationContext.questionStage,
      lastSuggestions: JSON.stringify(result.suggestions || []),
      lastSuggestionOptions: JSON.stringify(result.suggestionOptions || []),
      updatedAt: new Date(),
    })
    .where(eq(motivationConversations.id, conversation.id));

  return NextResponse.json({
    messages,
    nextQuestion: isCompleted ? null : result.question,
    suggestions: isCompleted ? [] : result.suggestions,
    suggestionOptions: isCompleted ? [] : result.suggestionOptions,
    questionCount: newQuestionCount,
    isCompleted,
    scores: newScores,
    evidenceSummary: result.evidenceSummary,
    coachingFocus: result.coachingFocus,
    riskFlags: result.riskFlags,
    questionStage: result.questionStage,
  });
}
