"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { OperationLockProvider, useOperationLock } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import {
  STARProgressBar,
  STARScoreChange,
  CompletionSummary,
  CompanyLinker,
  type STARScores
} from "@/components/gakuchika";
import { STAR_EXPLANATIONS } from "@/components/gakuchika/STARProgressBar";

const STAR_HINT_ICONS: Record<string, string> = {
  situation: "\u{1F4CD}",
  task: "\u{1F3AF}",
  action: "\u26A1",
  result: "\u{1F31F}",
};
const STAR_HINT_LABELS: Record<string, string> = {
  situation: "\u72B6\u6CC1",
  task: "\u8AB2\u984C",
  action: "\u884C\u52D5",
  result: "\u7D50\u679C",
};

interface Company {
  id: string;
  name: string;
}

interface Session {
  id: string;
  status: string;
  starScores: STARScores | null;
  questionCount: number;
  createdAt: string;
}

// Icons
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

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

function GakuchikaConversationContent() {
  const params = useParams();
  const gakuchikaId = params.id as string;
  const { isLocked, acquireLock, releaseLock } = useOperationLock();

  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [starScores, setStarScores] = useState<STARScores | null>(null);
  const [linkedCompanies, setLinkedCompanies] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Conversation start state
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gakuchikaTitle, setGakuchikaTitle] = useState<string>("");
  const [gakuchikaContent, setGakuchikaContent] = useState<string | null>(null);
  const [showStarInfo, setShowStarInfo] = useState(false);

  const [targetElement, setTargetElement] = useState<string | null>(null);
  const [previousScores, setPreviousScores] = useState<STARScores | null>(null);
  const [showScoreChange, setShowScoreChange] = useState(false);
  const [summary, setSummary] = useState<{summary: string; key_points: string[]; numbers: string[]; strengths: string[]} | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  // Fetch conversation and gakuchika data
  const fetchConversation = useCallback(async (sessionId?: string) => {
    try {
      const url = sessionId
        ? `/api/gakuchika/${gakuchikaId}/conversation?sessionId=${sessionId}`
        : `/api/gakuchika/${gakuchikaId}/conversation`;

      const [conversationRes, gakuchikaRes, companiesRes] = await Promise.all([
        fetch(url, {
          headers: buildHeaders(),
          credentials: "include",
        }),
        fetch(`/api/gakuchika/${gakuchikaId}`, {
          headers: buildHeaders(),
          credentials: "include",
        }),
        fetch("/api/companies", {
          headers: buildHeaders(),
          credentials: "include",
        }),
      ]);

      if (!conversationRes.ok) {
        const errorData = await conversationRes.json().catch(() => ({}));
        throw new Error(errorData.error || "会話の取得に失敗しました");
      }

      const conversationData = await conversationRes.json();

      // Handle "no conversation" state - show start screen
      if (conversationData.noConversation) {
        setConversationStarted(false);
        setGakuchikaTitle(conversationData.gakuchikaTitle || "");
        setGakuchikaContent(conversationData.gakuchikaContent || null);
        setSessions([]);
      } else {
        // Existing conversation - show chat UI
        setConversationStarted(true);
        const messagesWithIds = (conversationData.messages || []).map(
          (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
            ...msg,
            id: msg.id || `msg-${idx}`,
          })
        );
        setMessages(messagesWithIds);
        setNextQuestion(conversationData.nextQuestion);
        setQuestionCount(conversationData.questionCount || 0);
        setIsCompleted(conversationData.isCompleted || false);
        setIsAIPowered(conversationData.isAIPowered ?? true);
        setStarScores(conversationData.starScores || null);

        setSessions(conversationData.sessions || []);
        setCurrentSessionId(conversationData.conversation?.id || null);

        if (conversationData.starEvaluation?.weakest_element) {
          setTargetElement(conversationData.starEvaluation.weakest_element);
        }
      }

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setLinkedCompanies(gakuchikaData.gakuchika?.linkedCompanyIds || []);
        if (!conversationData.noConversation) {
          setGakuchikaTitle(gakuchikaData.gakuchika?.title || "");
        }
      }

      if (companiesRes.ok) {
        const companiesData = await companiesRes.json();
        setCompanies(companiesData.companies || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [gakuchikaId]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  // Start deep dive - create new conversation session
  const handleStartDeepDive = async () => {
    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/new`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "深掘りの開始に失敗しました");
      }

      const data = await response.json();
      setCurrentSessionId(data.conversation?.id || null);
      setConversationStarted(true);

      // Fetch the full conversation data
      await fetchConversation(data.conversation?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "深掘りの開始に失敗しました");
    } finally {
      setIsStarting(false);
    }
  };

  // Send answer with optimistic UI update via SSE streaming
  const handleSend = async () => {
    if (!answer.trim() || isSending) return;
    if (!acquireLock("AIに送信中")) return;

    const trimmedAnswer = answer.trim();
    const optimisticId = `optimistic-${Date.now()}`;

    // Optimistic update: show user message immediately
    const optimisticMessage: Message = {
      id: optimisticId,
      role: "user",
      content: trimmedAnswer,
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    setStreamingLabel(null);

    // Save previous scores for score change detection
    setPreviousScores(starScores);

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/stream`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: trimmedAnswer, sessionId: currentSessionId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }

      // Process SSE stream
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

          if (event.type === "progress") {
            setStreamingLabel(event.label || "処理中...");
          } else if (event.type === "complete") {
            const data = event.data;
            // Replace messages with server response (includes IDs)
            const messagesWithIds = (data.messages || []).map(
              (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
                ...msg,
                id: msg.id || `msg-${idx}`,
              })
            );
            setMessages(messagesWithIds);
            setNextQuestion(data.nextQuestion);
            setQuestionCount(data.questionCount || 0);
            setIsCompleted(data.isCompleted || false);
            setIsAIPowered(data.isAIPowered ?? true);

            // Set target element from response
            if (data.targetElement) {
              setTargetElement(data.targetElement);
            }

            // Check if scores changed and show score change notification
            const newScores = data.starScores || null;
            if (previousScores && newScores) {
              const scoresChanged =
                previousScores.situation !== newScores.situation ||
                previousScores.task !== newScores.task ||
                previousScores.action !== newScores.action ||
                previousScores.result !== newScores.result;

              if (scoresChanged) {
                setShowScoreChange(true);
              }
            }
            setStarScores(newScores);

            // Handle completion summary
            if (data.isCompleted && data.summary) {
              setSummary(data.summary);
              setIsSummaryLoading(false);
            } else if (data.isCompleted) {
              setIsSummaryLoading(true);
            }
          } else if (event.type === "error") {
            throw new Error(event.message || "AIエラーが発生しました");
          }
        }
      }
    } catch (err) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(trimmedAnswer); // Restore the answer
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
      setIsWaitingForResponse(false);
      setStreamingLabel(null);
      releaseLock();
    }
  };

  // Handle company linking
  const handleToggleCompany = async (companyId: string) => {
    const newLinkedCompanies = linkedCompanies.includes(companyId)
      ? linkedCompanies.filter((id) => id !== companyId)
      : [...linkedCompanies, companyId];

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}`, {
        method: "PUT",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ linkedCompanyIds: newLinkedCompanies }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      setLinkedCompanies(newLinkedCompanies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業の紐づけに失敗しました");
    }
  };

  // Handle session selection
  const handleSessionSelect = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    await fetchConversation(sessionId);
  };

  // Handle new session creation
  const handleNewSession = async () => {
    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation/new`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to create new session");
      }

      const data = await response.json();
      setCurrentSessionId(data.sessionId);
      await fetchConversation(data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新しいセッションの作成に失敗しました");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground mt-3">読み込み中...</p>
          </div>
        </main>
      </div>
    );
  }

  // "Start Deep Dive" screen - shown when no conversation exists
  if (!conversationStarted) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/gakuchika"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeftIcon />
            戻る
          </Link>

          <div className="space-y-6">
            {/* Gakuchika content card */}
            <Card>
              <CardContent className="pt-6">
                <h1 className="text-xl font-bold mb-2">{gakuchikaTitle}</h1>
                {gakuchikaContent && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {gakuchikaContent}
                  </p>
                )}
                {!gakuchikaContent && (
                  <p className="text-sm text-muted-foreground">
                    テーマのみ登録されています。深掘り会話で内容を膨らませましょう。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Collapsible STAR explanation */}
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
                STARフレームワークとは？
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <p className="text-xs text-muted-foreground mb-3">
                  ガクチカを魅力的に伝えるための4つの要素です。深掘り会話で各要素の充実度を高めていきます。
                </p>
                {Object.entries(STAR_EXPLANATIONS).map(([key, info]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                      {key[0].toUpperCase()}
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

            {/* Start button */}
            <Button
              onClick={handleStartDeepDive}
              disabled={isStarting}
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
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
                  深掘りを始める
                </span>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              AIアドバイザーがあなたのガクチカを深掘りする質問を投げかけます
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Conversation UI (existing chat flow)
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />

      {/* Header - compact */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {/* Row 1: Back + STAR Progress + badges + session selector */}
          <div className="flex items-center gap-3">
            <Link
              href="/gakuchika"
              className="shrink-0 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftIcon />
            </Link>

            {/* STAR Progress Bar - inline */}
            <div className="flex-1 min-w-0">
              <STARProgressBar scores={starScores} />
            </div>

            {/* AI badge */}
            {isAIPowered ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI
              </span>
            ) : (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                基本
              </span>
            )}

            {/* Session selector - subtle tabs */}
            {sessions.length > 1 && (
              <div className="shrink-0 flex items-center gap-1">
                {sessions.map((session, index) => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session.id)}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded border transition-colors",
                      session.id === currentSessionId
                        ? "bg-muted font-medium border-border text-foreground"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                  >
                    #{sessions.length - index}
                    {session.status === "completed" ? " (完了)" : ` (${session.questionCount}問)`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: Company linking (only if companies exist) */}
          {companies.length > 0 && (
            <div className="mt-1">
              <CompanyLinker
                companies={companies}
                linkedCompanyIds={linkedCompanies}
                onToggle={handleToggleCompany}
              />
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
          {!isAIPowered && !isCompleted && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800">
                <strong>基本質問モード:</strong> AIサーバーに接続できないため、定型の質問を使用しています。
                回答は通常通り保存されます。
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive mb-3">{error}</p>
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
          )}

          {/* STARScoreChange notification */}
          {showScoreChange && previousScores && starScores && (
            <STARScoreChange
              previousScores={previousScores}
              currentScores={starScores}
              onDismiss={() => setShowScoreChange(false)}
            />
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isOptimistic={message.isOptimistic}
            />
          ))}

          {/* Thinking indicator while waiting for AI response */}
          {isWaitingForResponse && (
            <ThinkingIndicator text={streamingLabel || "次の質問を考え中"} />
          )}

          {/* Next question from AI (skip if already shown in messages) */}
          {nextQuestion && !isCompleted && !isWaitingForResponse &&
            !(messages.length > 0 &&
              messages[messages.length - 1].role === "assistant" &&
              messages[messages.length - 1].content === nextQuestion) && (
            <ChatMessage
              role="assistant"
              content={nextQuestion}
            />
          )}

          {/* CompletionSummary */}
          {isCompleted && (
            <CompletionSummary
              starScores={starScores!}
              summary={summary}
              isLoading={isSummaryLoading}
              gakuchikaId={gakuchikaId}
              onNewSession={handleNewSession}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {!isCompleted && (
        <div className="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-3xl mx-auto">
            {/* STAR hint - inline */}
            {targetElement && STAR_HINT_LABELS[targetElement] && (
              <div className="px-4 pt-2 pb-1">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span>{STAR_HINT_ICONS[targetElement]}</span>
                  <span>この質問は <strong className="font-medium text-foreground/80">{STAR_HINT_LABELS[targetElement]}</strong> に関するものです</span>
                </span>
              </div>
            )}

            <ChatInput
              value={answer}
              onChange={setAnswer}
              onSend={handleSend}
              placeholder="回答を入力..."
              disabled={isWaitingForResponse}
              isSending={isSending}
              className="border-t-0 [&>div]:max-w-none [&>div]:px-4 [&>div]:py-2 [&>p]:hidden"
            />
            {/* Save and continue later - only show after at least 1 answer */}
            {questionCount > 0 && !isWaitingForResponse && (
              <div className="px-4 pb-2">
                <Link
                  href="/gakuchika"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  保存して後で続ける
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GakuchikaConversationPage() {
  return (
    <OperationLockProvider>
      <NavigationGuard />
      <GakuchikaConversationContent />
    </OperationLockProvider>
  );
}
