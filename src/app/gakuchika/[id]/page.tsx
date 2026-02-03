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
import { STARProgressBar, type STARScores } from "@/components/gakuchika";

interface Company {
  id: string;
  name: string;
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

export default function GakuchikaConversationPage() {
  const params = useParams();
  const gakuchikaId = params.id as string;

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
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  // Fetch conversation and gakuchika data
  const fetchConversation = useCallback(async () => {
    try {
      const [conversationRes, gakuchikaRes, companiesRes] = await Promise.all([
        fetch(`/api/gakuchika/${gakuchikaId}/conversation`, {
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
      // Add IDs to messages if not present (backward compatibility)
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

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setLinkedCompanies(gakuchikaData.gakuchika?.linkedCompanyIds || []);
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

  // Send answer with optimistic UI update
  const handleSend = async () => {
    if (!answer.trim() || isSending) return;

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

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: trimmedAnswer }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await response.json();
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
      setStarScores(data.starScores || null);
    } catch (err) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(trimmedAnswer); // Restore the answer
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
      setIsWaitingForResponse(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-16">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground mt-3">会話を読み込み中...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader />

      {/* Header */}
      <div className="border-b border-border bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/gakuchika"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftIcon />
              戻る
            </Link>
            <div className="flex items-center gap-2">
              {isAIPowered ? (
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI深掘り
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  基本質問
                </span>
              )}
            </div>
          </div>

          {/* STAR Progress Bar - Compact inline version */}
          <div className="mb-3">
            <STARProgressBar scores={starScores} />
          </div>

          {/* Company linking */}
          <div className="relative">
            <button
              onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              企業に紐づけ
            </button>

            {linkedCompanies.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {linkedCompanies.map((companyId) => {
                  const company = companies.find((c) => c.id === companyId);
                  if (!company) return null;
                  return (
                    <button
                      key={companyId}
                      onClick={() => handleToggleCompany(companyId)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                    >
                      {company.name}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {showCompanyDropdown && (
              <div className="absolute top-full left-0 mt-2 w-full sm:w-72 max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-lg border border-border z-50 max-h-64 overflow-y-auto">
                {companies.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    企業が登録されていません
                  </div>
                ) : (
                  <div className="py-2">
                    {companies.map((company) => (
                      <button
                        key={company.id}
                        onClick={() => {
                          handleToggleCompany(company.id);
                          setShowCompanyDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-muted transition-colors flex items-center justify-between"
                      >
                        <span>{company.name}</span>
                        {linkedCompanies.includes(company.id) && (
                          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
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
            <ThinkingIndicator text="次の質問を考え中" />
          )}

          {/* Next question from AI */}
          {nextQuestion && !isCompleted && !isWaitingForResponse && (
            <ChatMessage
              role="assistant"
              content={nextQuestion}
            />
          )}

          {/* Completion message */}
          {isCompleted && (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="py-6">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-success text-success-foreground flex items-center justify-center mx-auto mb-4">
                    <CheckIcon />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">深掘り完了!</h3>
                  <p className="text-sm text-muted-foreground">
                    STAR法に基づいて十分な情報が集まりました
                  </p>
                </div>

                {/* STAR Summary */}
                {starScores && (
                  <div className="bg-background rounded-lg p-4 mb-6">
                    <h4 className="text-sm font-medium text-foreground mb-3">深掘り結果サマリー</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">状況・背景</span>
                        <span className="text-sm font-semibold text-success">{starScores.situation}%</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">課題・目標</span>
                        <span className="text-sm font-semibold text-success">{starScores.task}%</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">行動・工夫</span>
                        <span className="text-sm font-semibold text-success">{starScores.action}%</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">結果・学び</span>
                        <span className="text-sm font-semibold text-success">{starScores.result}%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button asChild variant="default">
                    <Link href="/es">
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      ESを作成する
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/gakuchika">一覧に戻る</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {!isCompleted && (
        <div className="border-t border-border bg-background">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              value={answer}
              onChange={setAnswer}
              onSend={handleSend}
              placeholder="回答を入力..."
              disabled={isWaitingForResponse}
              isSending={isSending}
            />
            {/* Save and continue later - only show after at least 1 answer */}
            {questionCount > 0 && !isWaitingForResponse && (
              <div className="px-4 pb-3 -mt-1">
                <Link
                  href="/gakuchika"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  保存して後で続ける
                </Link>
                <span className="text-[10px] text-muted-foreground/70 ml-2">
                  (回答は自動保存されます)
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
