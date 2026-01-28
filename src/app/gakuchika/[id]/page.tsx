"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";

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

const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
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
  role: "user" | "assistant";
  content: string;
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
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [linkedCompanies, setLinkedCompanies] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        throw new Error("Failed to fetch conversation");
      }

      const conversationData = await conversationRes.json();
      setMessages(conversationData.messages || []);
      setNextQuestion(conversationData.nextQuestion);
      setQuestionCount(conversationData.questionCount || 0);
      setIsCompleted(conversationData.isCompleted || false);
      setIsAIPowered(conversationData.isAIPowered ?? true);

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

  // Send answer
  const handleSend = async () => {
    if (!answer.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/gakuchika/${gakuchikaId}/conversation`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: answer.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send");
      }

      const data = await response.json();
      setMessages(data.messages || []);
      setNextQuestion(data.nextQuestion);
      setQuestionCount(data.questionCount || 0);
      setIsCompleted(data.isCompleted || false);
      setIsAIPowered(data.isAIPowered ?? true);
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
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
          <div className="flex items-center justify-between mb-3">
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
                  AI質問
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  基本質問
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {questionCount}/8 質問
              </span>
              {isCompleted && (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  完了
                </span>
              )}
            </div>
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
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-border z-50 max-h-64 overflow-y-auto">
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
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {/* Next question (AI typing) */}
          {nextQuestion && !isCompleted && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted">
                <p className="text-sm whitespace-pre-wrap">{nextQuestion}</p>
              </div>
            </div>
          )}

          {/* Completion message */}
          {isCompleted && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="py-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-3">
                  <CheckIcon />
                </div>
                <h3 className="font-medium text-emerald-800 mb-2">深掘り完了!</h3>
                <p className="text-sm text-emerald-700">
                  この内容を参考にESを書いてみましょう
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/es">ESを作成する</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {!isCompleted && (
        <div className="border-t border-border bg-background">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="回答を入力..."
                rows={2}
                className="flex-1 px-4 py-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isSending}
              />
              <Button
                onClick={handleSend}
                disabled={!answer.trim() || isSending}
                size="icon"
                className="w-12 h-12 rounded-xl"
              >
                {isSending ? <LoadingSpinner /> : <SendIcon />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Shift + Enter で改行、Enter で送信
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
