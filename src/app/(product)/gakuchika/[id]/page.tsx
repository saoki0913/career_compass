"use client";

import { startTransition, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { OperationLockProvider, useOperationLock } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import {
  CompletionSummary,
  STAR_EXPLANATIONS,
  STARProgressBar,
  type ConversationState,
} from "@/components/gakuchika";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";
import { getUserFacingErrorMessage, parseApiErrorResponse } from "@/lib/api-errors";
import {
  getDefaultConversationState,
  hasDraftText,
  isDraftReady,
  isInterviewReady,
} from "@/lib/gakuchika/conversation-state";

const PROCESSING_LABELS = {
  organizing_intent: "質問の意図を整理中",
  generating_question: "次の質問を生成中...",
} as const;
const SUMMARY_POLL_INTERVAL_MS = 1500;
const SUMMARY_POLL_MAX_ATTEMPTS = 8;
const GAKUCHIKA_ES_DRAFT_CHAR_LIMIT = 400;

type AssistantProcessingPhase = "idle" | "organizing_intent" | "generating_question";

interface ConversationUpdate {
  messages: Message[];
  nextQuestion: string | null;
  questionCount: number;
  isCompleted: boolean;
  isInterviewReady: boolean;
  conversationState: ConversationState | null;
  isAIPowered: boolean;
  summaryPending: boolean;
}

interface Session {
  id: string;
  status: "in_progress" | "completed";
  conversationState: ConversationState | null;
  questionCount: number;
  createdAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
}

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

function getProcessingPhase(step?: string): AssistantProcessingPhase {
  if (step === "analysis") return "organizing_intent";
  if (step === "question") return "generating_question";
  return "organizing_intent";
}

function DraftReadyPanel({
  state,
  onResumeSession,
}: {
  state: ConversationState | null;
  onResumeSession?: () => void;
}) {
  const hasDraft = hasDraftText(state);
  return (
    <Card className="border-border/60 bg-background shadow-sm">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            ES作成可
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            {hasDraft ? "ES を起点に更に深掘りできます" : "ここまででガクチカ ES を作成できます"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasDraft
              ? "作成済みの ES を見ながら、同じ会話の続きとして面接向けの深掘りを進められます。"
              : state?.draftReadinessReason || "ES本文を書ける最低限の材料が揃っています。"}
          </p>
        </div>

        {hasDraft && onResumeSession ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onResumeSession}>
              更に深掘りする
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GakuchikaConversationContent() {
  const params = useParams();
  const router = useRouter();
  const gakuchikaId = params.id as string;
  const { acquireLock, releaseLock } = useOperationLock();

  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isInterviewReadyState, setIsInterviewReadyState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);

  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gakuchikaTitle, setGakuchikaTitle] = useState<string>("");
  const [gakuchikaContent, setGakuchikaContent] = useState<string | null>(null);
  const [showStarInfo, setShowStarInfo] = useState(false);

  const [summary, setSummary] = useState<ReturnType<typeof parseGakuchikaSummary>>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assistantPhase, setAssistantPhase] = useState<AssistantProcessingPhase>("idle");
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantPhase, messages, nextQuestion, streamingAssistantText]);

  const applyConversationUpdate = useCallback((update: ConversationUpdate) => {
    startTransition(() => {
      setMessages(update.messages);
      setNextQuestion(update.nextQuestion);
      setQuestionCount(update.questionCount);
      setIsCompleted(update.isCompleted);
      setIsInterviewReadyState(update.isInterviewReady);
      setIsAIPowered(update.isAIPowered);
      setConversationState(update.conversationState);

      if (update.isInterviewReady) {
        setSummary(null);
        setIsSummaryLoading(update.summaryPending);
      } else if (!update.isCompleted) {
        setSummary(null);
        setIsSummaryLoading(false);
      }
    });
  }, []);

  const fetchSummaryIfAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}`, {
        headers: buildHeaders(),
        credentials: "include",
      });
      if (!response.ok) return false;

      const data = await response.json();
      const parsedSummary = parseGakuchikaSummary(data.gakuchika?.summary ?? null);
      if (!parsedSummary) return false;

      startTransition(() => {
        setSummary(parsedSummary);
        setIsSummaryLoading(false);
      });
      return true;
    } catch {
      return false;
    }
  }, [gakuchikaId]);

  const fetchConversation = useCallback(async (sessionId?: string) => {
    try {
      const url = sessionId
        ? `/api/gakuchika/${gakuchikaId}/conversation?sessionId=${sessionId}`
        : `/api/gakuchika/${gakuchikaId}/conversation`;

      const [conversationRes, gakuchikaRes] = await Promise.all([
        fetch(url, {
          headers: buildHeaders(),
          credentials: "include",
        }),
        fetch(`/api/gakuchika/${gakuchikaId}`, {
          headers: buildHeaders(),
          credentials: "include",
        }),
      ]);

      if (!conversationRes.ok) {
        const errorData = await conversationRes.json().catch(() => ({}));
        throw new Error(errorData.error || "会話の取得に失敗しました");
      }

      const conversationData = await conversationRes.json();

      if (conversationData.noConversation) {
        setConversationStarted(false);
        setGakuchikaTitle(conversationData.gakuchikaTitle || "");
        setGakuchikaContent(conversationData.gakuchikaContent || null);
        setSessions([]);
        setConversationState(getDefaultConversationState());
        setSummary(null);
        setIsSummaryLoading(false);
      } else {
        setConversationStarted(true);
        const messagesWithIds = (conversationData.messages || []).map(
          (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
            ...msg,
            id: msg.id || `msg-${idx}`,
          }),
        );
        setMessages(messagesWithIds);
        setNextQuestion(conversationData.nextQuestion);
        setQuestionCount(conversationData.questionCount || 0);
        setIsCompleted(conversationData.isCompleted || false);
        setIsInterviewReadyState(Boolean(conversationData.isInterviewReady));
        setIsAIPowered(conversationData.isAIPowered ?? true);
        setConversationState(conversationData.conversationState || getDefaultConversationState());
        setSessions(conversationData.sessions || []);
        setCurrentSessionId(conversationData.conversation?.id || null);
      }

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setGakuchikaTitle(gakuchikaData.gakuchika?.title || "");
        setGakuchikaContent(gakuchikaData.gakuchika?.content || null);
        const parsedSummary = parseGakuchikaSummary(gakuchikaData.gakuchika?.summary ?? null);
        if (parsedSummary) {
          setSummary(parsedSummary);
          setIsSummaryLoading(false);
        } else if (conversationData.isInterviewReady) {
          setSummary(null);
          setIsSummaryLoading(true);
        } else {
          setSummary(null);
          setIsSummaryLoading(false);
        }
      }
    } catch (err) {
      setError(
        getUserFacingErrorMessage(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_FETCH_FAILED",
            userMessage: "会話の取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.fetchConversation",
        ),
      );
    } finally {
      setAssistantPhase("idle");
      setIsLoading(false);
    }
  }, [gakuchikaId]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    if (!isInterviewReadyState || !isSummaryLoading || summary) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      while (!cancelled && attempts < SUMMARY_POLL_MAX_ATTEMPTS) {
        attempts += 1;
        const found = await fetchSummaryIfAvailable();
        if (found || cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, SUMMARY_POLL_INTERVAL_MS));
      }

      if (!cancelled) {
        setIsSummaryLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [fetchSummaryIfAvailable, isInterviewReadyState, isSummaryLoading, summary]);

  const handleStartDeepDive = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/new`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_START_FAILED",
            userMessage: "作成の開始に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleStartDeepDive",
        );
      }

      const data = await response.json();
      setCurrentSessionId(data.conversation?.id || null);
      setConversationStarted(true);
      await fetchConversation(data.conversation?.id);
    } catch (err) {
      setError(
        getUserFacingErrorMessage(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_START_FAILED",
            userMessage: "作成の開始に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleStartDeepDive",
        ),
      );
    } finally {
      setIsStarting(false);
    }
  }, [fetchConversation, gakuchikaId]);

  const handleSend = useCallback(async () => {
    if (!answer.trim() || isSending) return;
    if (!acquireLock("AIに送信中")) return;

    const trimmedAnswer = answer.trim();
    const optimisticId = `optimistic-${Date.now()}`;

    setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: trimmedAnswer, isOptimistic: true }]);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    setAssistantPhase("organizing_intent");
    setStreamingAssistantText("");
    setNextQuestion(null);
    setConversationState((prev) =>
      prev
        ? {
            ...prev,
            answerHint: null,
            progressLabel: null,
            focusKey: null,
          }
        : prev,
    );

    let receivedComplete = false;
    let hasReceivedQuestionStream = false;
    let streamedQuestionText = "";

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/stream`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: trimmedAnswer, sessionId: currentSessionId }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleSend",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("ストリームが利用できません");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "hint_ready") {
            setConversationState((prev) =>
              prev
                ? {
                    ...prev,
                    focusKey: event.data?.focusKey || prev.focusKey,
                    answerHint: event.data?.answerHint || prev.answerHint,
                    progressLabel: event.data?.progressLabel || prev.progressLabel,
                  }
                : prev,
            );
          } else if (event.type === "progress" && !hasReceivedQuestionStream) {
            setAssistantPhase(getProcessingPhase(event.step));
          } else if (
            event.type === "string_chunk" &&
            event.path === "question" &&
            typeof event.text === "string"
          ) {
            hasReceivedQuestionStream = true;
            streamedQuestionText += event.text;
            setAssistantPhase("idle");
            setStreamingAssistantText(streamedQuestionText);
          } else if (event.type === "complete") {
            const data = event.data;
            const messagesWithIds = (data.messages || []).map(
              (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
                ...msg,
                id: msg.id || `msg-${idx}`,
              }),
            );
            receivedComplete = true;
            setStreamingAssistantText("");
            applyConversationUpdate({
              messages: messagesWithIds,
              nextQuestion: data.nextQuestion,
              questionCount: data.questionCount || 0,
              isCompleted: data.isCompleted || false,
              isInterviewReady: Boolean(data.isInterviewReady),
              conversationState: data.conversationState || getDefaultConversationState(),
              isAIPowered: data.isAIPowered ?? true,
              summaryPending: Boolean(data.summaryPending),
            });
            setIsWaitingForResponse(false);
            setAssistantPhase("idle");
          } else if (event.type === "error") {
            throw new Error(event.message || "AIエラーが発生しました");
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(trimmedAnswer);
      setNextQuestion(null);
      setStreamingAssistantText("");
      setAssistantPhase("idle");
      setIsWaitingForResponse(false);
      setError(
        getUserFacingErrorMessage(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleSend",
        ),
      );
    } finally {
      setIsSending(false);
      if (!receivedComplete) {
        setStreamingAssistantText("");
        setIsWaitingForResponse(false);
        setAssistantPhase("idle");
      }
      releaseLock();
    }
  }, [acquireLock, answer, applyConversationUpdate, currentSessionId, gakuchikaId, isSending, releaseLock]);

  const handleSessionSelect = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    await fetchConversation(sessionId);
  };

  const handleResumeSession = async () => {
    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/resume`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ sessionId: currentSessionId }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_RESUME_FAILED",
            userMessage: "深掘りの再開に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleResumeSession",
        );
      }

      const data = await response.json();
      const messagesWithIds = (data.messages || []).map(
        (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
          ...msg,
          id: msg.id || `msg-${idx}`,
        }),
      );

      setConversationStarted(true);
      setCurrentSessionId(data.conversation?.id || null);
      setMessages(messagesWithIds);
      setNextQuestion(data.nextQuestion || null);
      setQuestionCount(data.questionCount || 0);
      setIsCompleted(Boolean(data.isCompleted));
      setIsInterviewReadyState(Boolean(data.isInterviewReady));
      setConversationState(data.conversationState || getDefaultConversationState());
      setSessions(data.sessions || []);
      setIsAIPowered(data.isAIPowered ?? true);
      setSummary(null);
      setIsSummaryLoading(false);
      setError(null);
    } catch (err) {
      setError(
        getUserFacingErrorMessage(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_RESUME_FAILED",
            userMessage: "深掘りの再開に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleResumeSession",
        ),
      );
    }
  };

  const handleGenerateDraft = useCallback(async () => {
    if (!isDraftReady(conversationState) || isGeneratingDraft) return;
    if (!acquireLock("ガクチカESを生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/generate-es-draft`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ charLimit: GAKUCHIKA_ES_DRAFT_CHAR_LIMIT }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleGenerateDraft",
        );
      }

      const data = await response.json();
      if (data.documentId) {
        router.push(`/es/${data.documentId}`);
      }
    } catch (err) {
      setError(
        getUserFacingErrorMessage(
          err,
          {
            code: "GAKUCHIKA_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleGenerateDraft",
        ),
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [acquireLock, conversationState, gakuchikaId, isGeneratingDraft, releaseLock, router]);

  const processingText =
    assistantPhase === "organizing_intent" || assistantPhase === "generating_question"
      ? PROCESSING_LABELS[assistantPhase]
      : null;

  const draftReady = isDraftReady(conversationState);
  const interviewReady = isInterviewReady(conversationState) || isInterviewReadyState;
  const generatedDraft = hasDraftText(conversationState);
  const gakuchikaDraftHelperText = interviewReady
    ? "面接で使う補足まで整理済みです。必要なら一覧やESへ戻れます。"
    : generatedDraft
    ? "ES を起点に、この画面から更に深掘りできます。"
    : draftReady
    ? "ここまででガクチカESを 400 字前後で作成できます。成功時のみクレジット消費です。"
    : "材料が揃うとガクチカESを作成できます。";
  const currentSessionIndex = currentSessionId
    ? sessions.findIndex((session) => session.id === currentSessionId)
    : -1;
  const currentSessionLabel = currentSessionIndex >= 0 ? `#${sessions.length - currentSessionIndex}` : null;

  const handleRestartConversation = useCallback(async () => {
    if (isStarting || isSending || isGeneratingDraft) return;
    await handleStartDeepDive();
  }, [handleStartDeepDive, isGeneratingDraft, isSending, isStarting]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <DashboardHeader />
        <GakuchikaDeepDiveSkeleton accent="ガクチカ作成の材料を読み込んでいます" />
      </div>
    );
  }

  if (!conversationStarted) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/gakuchika"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeftIcon />
            戻る
          </Link>

          <div className="space-y-6 max-w-3xl">
            <Card>
              <CardContent className="pt-6">
                <h1 className="text-xl font-bold mb-2">{gakuchikaTitle}</h1>
                {gakuchikaContent ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {gakuchikaContent}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    テーマのみ登録されています。短い会話で ES に使える材料を揃えていきます。
                  </p>
                )}
              </CardContent>
            </Card>

            <details
              className="group"
              open={showStarInfo}
              onToggle={(e) => setShowStarInfo((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 py-2">
                <svg
                  className={cn("w-4 h-4 transition-transform", showStarInfo && "rotate-90")}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                先に整理する4つの要素
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <p className="text-xs text-muted-foreground mb-3">
                  最初は状況・課題・行動・結果を押さえ、ES が書ける状態まで短く整えます。
                </p>
                {Object.entries(STAR_EXPLANATIONS).map(([key, info]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      {info.title[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{info.title}</p>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">{info.example}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button onClick={handleStartDeepDive} disabled={isStarting} className="w-full h-12 text-base font-medium" size="lg">
              {isStarting ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner />
                  AIが最初の質問を準備中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  作成を始める
                </span>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              最初は短い会話で ES を書ける材料を揃え、その後に必要なら同じ画面で深掘りできます
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ConversationWorkspaceShell
      backHref="/gakuchika"
      title="ガクチカを作成"
      subtitle={gakuchikaTitle || "作成セッション"}
      actionBar={
        <ConversationActionBar
          helperText={gakuchikaDraftHelperText}
          actionLabel="ガクチカESを作成"
          pendingLabel="作成中..."
          onAction={handleGenerateDraft}
          disabled={!draftReady || isGeneratingDraft}
          isPending={isGeneratingDraft}
        />
      }
      mobileStatus={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{questionCount > 0 ? `${questionCount}問` : "準備中"}</span>
          {currentSessionLabel ? (
            <Badge variant="outline" className="px-2 py-0 text-[11px]">
              {currentSessionLabel}
            </Badge>
          ) : null}
          <Badge variant={isAIPowered ? "soft-primary" : "outline"} className="px-2 py-0 text-[11px]">
            {isAIPowered ? "AI" : "基本"}
          </Badge>
        </div>
      }
      conversation={
        <div className="space-y-4">
          {!isAIPowered && !interviewReady ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                <strong>基本質問モード:</strong> AIサーバーに接続できないため、定型の質問を使用しています。回答は通常通り保存されます。
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <p className="mb-3 text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  fetchConversation();
                }}
              >
                もう一度試す
              </Button>
            </div>
          ) : null}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isOptimistic={message.isOptimistic}
            />
          ))}

          {isWaitingForResponse && !streamingAssistantText && processingText ? (
            <ThinkingIndicator text={processingText} />
          ) : null}

          {isWaitingForResponse && streamingAssistantText ? (
            <ChatMessage role="assistant" content={streamingAssistantText} isStreaming />
          ) : null}

          {nextQuestion &&
          !isCompleted &&
          !isWaitingForResponse &&
          !(messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === nextQuestion) ? (
            <ChatMessage role="assistant" content={nextQuestion} />
          ) : null}

          <div ref={messagesEndRef} />

          {interviewReady ? (
            <CompletionSummary
              summary={summary}
              isLoading={isSummaryLoading}
              gakuchikaId={gakuchikaId}
              onResumeSession={undefined}
              hideGenerateAction
            />
          ) : isCompleted ? (
            <DraftReadyPanel state={conversationState} onResumeSession={generatedDraft ? handleResumeSession : undefined} />
          ) : null}
        </div>
      }
      composer={
        !isCompleted ? (
          <div className="space-y-3">
            {conversationState?.answerHint ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>{conversationState.answerHint}</span>
              </span>
            ) : null}

            <ChatInput
              value={answer}
              onChange={setAnswer}
              onSend={handleSend}
              placeholder="回答を入力..."
              disabled={false}
              disableSend={assistantPhase !== "idle"}
              isSending={isSending}
              className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0 [&>p]:hidden"
            />

            {questionCount > 0 && assistantPhase === "idle" ? (
              <Link
                href="/gakuchika"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                保存して後で続ける
              </Link>
            ) : null}
          </div>
        ) : undefined
      }
      sidebar={
        <>
          <ConversationSidebarCard
            title="進捗"
            actions={
              <div className="flex flex-wrap gap-2">
                {generatedDraft && !interviewReady ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResumeSession}
                    disabled={isStarting || isSending || isGeneratingDraft}
                    className="h-9 rounded-xl px-3 text-xs shadow-sm"
                  >
                    更に深掘りする
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestartConversation}
                  disabled={isStarting || isSending || isGeneratingDraft}
                  className="h-9 rounded-xl px-3 text-xs shadow-sm"
                >
                  会話をやり直す
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={isAIPowered ? "soft-primary" : "outline"} className="px-3 py-1 text-[11px]">
                  {isAIPowered ? "AI質問" : "基本質問"}
                </Badge>
                {currentSessionLabel ? (
                  <Badge variant="outline" className="px-3 py-1 text-[11px]">
                    セッション {currentSessionLabel}
                  </Badge>
                ) : null}
              </div>
              <STARProgressBar state={conversationState} status={isCompleted ? "completed" : "in_progress"} />
              <p className="text-xs leading-5 text-muted-foreground">
                {conversationState?.progressLabel
                  ? `${conversationState.progressLabel}。`
                  : "短い会話で ES の骨格を整え、その後に必要なら面接向けの深掘りへ進みます。"}
              </p>
            </div>
          </ConversationSidebarCard>

          {sessions.length > 1 ? (
            <ConversationSidebarCard title="セッション履歴">
              <div className="space-y-2">
                {sessions.map((session, index) => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left text-xs transition-colors",
                      session.id === currentSessionId
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">#{sessions.length - index}</span>
                      <span>{session.status === "completed" ? "完了" : `${session.questionCount}問`}</span>
                    </div>
                  </button>
                ))}
              </div>
            </ConversationSidebarCard>
          ) : null}

          <ConversationSidebarCard title="作成メモ">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{gakuchikaTitle}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {gakuchikaContent || "テーマのみ登録されています。会話で内容を膨らませていきます。"}
              </p>
            </div>
          </ConversationSidebarCard>
        </>
      }
    />
  );
}

export default function GakuchikaConversationPage() {
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10 max-lg:max-w-full max-lg:px-3">
          <LoginRequiredForAi title="ガクチカ作成はログイン後にご利用いただけます" />
        </main>
      </div>
    );
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <GakuchikaConversationContent />
    </OperationLockProvider>
  );
}
