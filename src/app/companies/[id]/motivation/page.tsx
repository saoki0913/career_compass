"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { OperationLockProvider, useOperationLock } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";

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

const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
}

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

interface Company {
  id: string;
  name: string;
  industry: string | null;
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

// Suggestion chips component for quick answers
function SuggestionChips({
  suggestions,
  onSelect,
  disabled = false,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground mb-2">選択して回答:</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion}-${index}`}
            type="button"
            onClick={() => !disabled && onSelect(suggestion)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-2 text-sm text-left",
              "border border-amber-200 bg-amber-50 text-amber-900",
              "hover:bg-amber-100 hover:border-amber-300",
              "dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200",
              "dark:hover:bg-amber-900/40 dark:hover:border-amber-600",
              "active:scale-[0.97]",
              "transition-all duration-200 cursor-pointer",
              "opacity-0 animate-fade-up",
              index === 0 && "delay-100",
              index === 1 && "delay-200",
              index === 2 && "delay-300",
              index === 3 && "delay-400",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

// Progress bar component for motivation elements
function MotivationProgressBar({ scores }: { scores: MotivationScores | null }) {
  if (!scores) return null;

  const elements = [
    { key: "company_understanding", label: "企業理解", score: scores.company_understanding },
    { key: "self_analysis", label: "自己分析", score: scores.self_analysis },
    { key: "career_vision", label: "キャリアビジョン", score: scores.career_vision },
    { key: "differentiation", label: "差別化", score: scores.differentiation },
  ];

  return (
    <div className="space-y-2">
      {elements.map(({ key, label, score }) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{score}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MotivationConversationContent() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const { isLocked, activeOperationLabel, acquireLock, releaseLock } = useOperationLock();

  const [company, setCompany] = useState<Company | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<MotivationScores | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  // Fetch company and conversation data
  const fetchData = useCallback(async () => {
    try {
      const headers = buildHeaders();

      // Fire both requests in parallel
      const [companyRes, convRes] = await Promise.all([
        fetch(`/api/companies/${companyId}`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/motivation/${companyId}/conversation`, {
          headers,
          credentials: "include",
        }),
      ]);

      if (!companyRes.ok) throw new Error("企業情報の取得に失敗しました");
      const companyData = await companyRes.json();
      setCompany(companyData.company);

      if (convRes.ok) {
        const convData = await convRes.json();
        const messagesWithIds = (convData.messages || []).map(
          (msg: { role: "user" | "assistant"; content: string; id?: string }, idx: number) => ({
            ...msg,
            id: msg.id || `msg-${idx}`,
          })
        );
        setMessages(messagesWithIds);
        setNextQuestion(convData.nextQuestion);
        setQuestionCount(convData.questionCount || 0);
        setIsCompleted(convData.isCompleted || false);
        setScores(convData.scores || null);
        setSuggestions(convData.suggestions || []);
        setGeneratedDraft(convData.generatedDraft || null);
        // Propagate initialization errors (e.g. FastAPI failure)
        if (convData.error) {
          setError(convData.error);
        }
      } else {
        setError("会話データの取得に失敗しました");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Send answer (from chip click or free-text input)
  const handleSend = async (chipText?: string) => {
    const textToSend = chipText || answer.trim();
    if (!textToSend || isSending) return;
    if (!acquireLock("AIに送信中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    const optimisticId = `optimistic-${Date.now()}`;
    const previousSuggestions = suggestions;

    const optimisticMessage: Message = {
      id: optimisticId,
      role: "user",
      content: textToSend,
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setAnswer("");
    setSuggestions([]);
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`/api/motivation/${companyId}/conversation/stream`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: textToSend }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "送信に失敗しました");
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("ストリームが取得できませんでした");

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

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
            setStreamingLabel(event.label || null);
          } else if (event.type === "complete") {
            completed = true;
            const data = event.data;
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
            setScores(data.scores || null);
            setSuggestions(data.suggestions || []);
          } else if (event.type === "error") {
            throw new Error(event.message || "AIサービスでエラーが発生しました");
          }
        }
      }

      if (!completed) {
        throw new Error("ストリームが途中で切断されました");
      }
    } catch (err) {
      // Remove optimistic message on error and restore previous state
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(textToSend);
      setSuggestions(previousSuggestions);
      if (err instanceof Error && err.name === "AbortError") {
        setError("AIの応答に時間がかかりすぎています。再度お試しください。");
      } else {
        setError(err instanceof Error ? err.message : "送信に失敗しました");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
      setIsWaitingForResponse(false);
      setStreamingLabel(null);
      releaseLock();
    }
  };

  // Generate ES draft and redirect to ES editor
  const handleGenerateDraft = async () => {
    if (isGeneratingDraft || messages.length === 0) return;
    if (!acquireLock("志望動機を生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await fetch(`/api/motivation/${companyId}/generate-draft`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ charLimit }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "ES生成に失敗しました");
      }

      const data = await response.json();
      setGeneratedDraft(data.draft);

      // Redirect to ES editor if document was created
      if (data.documentId) {
        router.push(`/es/${data.documentId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ES生成に失敗しました");
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground animate-pulse">
              AIが企業の情報を読み込んでいます...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">企業が見つかりません</p>
            <Button asChild className="mt-4">
              <Link href="/companies">企業一覧に戻る</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />
      <main className="flex-1 overflow-hidden max-w-6xl w-full mx-auto px-4 py-3 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <Link
            href={`/companies/${companyId}`}
            className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="戻る"
          >
            <ArrowLeftIcon />
          </Link>
          <div>
            <h1 className="text-xl font-bold">志望動機を作成</h1>
            <p className="text-sm text-muted-foreground">{company.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
          {/* Chat area */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden border border-border/50 rounded-xl bg-card">
            {/* Mobile progress indicator - shown only below lg */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 lg:hidden">
              <span className="text-sm font-medium text-muted-foreground">進捗</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((questionCount / 8) * 100, 100)}%` }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums">{questionCount}/8</span>
            </div>
            {/* Messages - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  isOptimistic={msg.isOptimistic}
                />
              ))}

              {/* Next question or thinking indicator */}
              {isWaitingForResponse ? (
                <ThinkingIndicator text={streamingLabel || "次の質問を考え中"} />
              ) : nextQuestion &&
                !(messages.length > 0 &&
                  messages[messages.length - 1].role === "assistant" &&
                  messages[messages.length - 1].content === nextQuestion) ? (
                <ChatMessage role="assistant" content={nextQuestion} />
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            {/* Error message */}
            {error && (
              <div className="shrink-0 mx-4 mb-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-2">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => { setError(null); releaseLock(); fetchData(); }}
                >
                  再試行
                </Button>
              </div>
            )}

            {/* Bottom fixed area: suggestions + input */}
            <div className="shrink-0 border-t border-border/50 p-4">
              {isCompleted ? (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 text-emerald-700">
                  <CheckIcon />
                  <span>深掘りが完了しました！右側の「ESを作成」ボタンで志望動機ESを作成できます。</span>
                </div>
              ) : (
                <>
                  {!isWaitingForResponse && nextQuestion && suggestions.length > 0 && (
                    <SuggestionChips
                      suggestions={suggestions}
                      onSelect={(text) => handleSend(text)}
                      disabled={isSending || isLocked}
                    />
                  )}
                  <ChatInput
                    value={answer}
                    onChange={setAnswer}
                    onSend={() => handleSend()}
                    disabled={isSending || !nextQuestion || isLocked}
                    placeholder="回答を入力..."
                    className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
                  />
                </>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="overflow-y-auto space-y-4">
            {/* Progress */}
            <Card className="border-border/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">進捗</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-center mb-4">
                  <span className="text-3xl font-bold">{questionCount}</span>
                  <span className="text-muted-foreground"> / 8問</span>
                </div>
                <MotivationProgressBar scores={scores} />
              </CardContent>
            </Card>

            {/* Draft generation */}
            <Card className="border-border/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DocumentIcon />
                  志望動機ESを作成
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">文字数</label>
                  <div className="flex gap-2">
                    {([300, 400, 500] as const).map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => setCharLimit(limit)}
                        className={cn(
                          "flex-1 py-2 text-sm rounded-lg border transition-colors cursor-pointer",
                          charLimit === limit
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-secondary"
                        )}
                      >
                        {limit}字
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleGenerateDraft}
                  disabled={isGeneratingDraft || messages.length < 2 || isLocked}
                  className="w-full"
                >
                  {isGeneratingDraft ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">ESを作成中...</span>
                    </>
                  ) : (
                    "ESを作成"
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  会話内容から志望動機ESを自動生成し、編集画面に移動します
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MotivationConversationPage() {
  return (
    <OperationLockProvider>
      <NavigationGuard />
      <MotivationConversationContent />
    </OperationLockProvider>
  );
}
