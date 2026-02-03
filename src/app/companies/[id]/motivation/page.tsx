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

export default function MotivationConversationPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

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
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  // Fetch company and conversation data
  const fetchData = useCallback(async () => {
    try {
      // Fetch company info
      const companyRes = await fetch(`/api/companies/${companyId}`, {
        headers: buildHeaders(),
        credentials: "include",
      });
      if (!companyRes.ok) throw new Error("企業情報の取得に失敗しました");
      const companyData = await companyRes.json();
      setCompany(companyData.company);

      // Fetch conversation if exists
      const convRes = await fetch(`/api/motivation/${companyId}/conversation`, {
        headers: buildHeaders(),
        credentials: "include",
      });
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
        setGeneratedDraft(convData.generatedDraft || null);
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

  // Send answer
  const handleSend = async () => {
    if (!answer.trim() || isSending) return;

    const trimmedAnswer = answer.trim();
    const optimisticId = `optimistic-${Date.now()}`;

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
      const response = await fetch(`/api/motivation/${companyId}/conversation`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ answer: trimmedAnswer }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "送信に失敗しました");
      }

      const data = await response.json();
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
    } catch (err) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setAnswer(trimmedAnswer);
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
      setIsWaitingForResponse(false);
    }
  };

  // Generate ES draft and redirect to ES editor
  const handleGenerateDraft = async () => {
    if (isGeneratingDraft || messages.length === 0) return;

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
      setIsGeneratingDraft(false);
    }
    // Note: We don't reset isGeneratingDraft on success because we're redirecting
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        </main>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-20">
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
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/companies/${companyId}`}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeftIcon />
          </Link>
          <div>
            <h1 className="text-xl font-bold">志望動機を作成</h1>
            <p className="text-sm text-muted-foreground">{company.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat area */}
          <div className="lg:col-span-2">
            <Card className="border-border/50">
              <CardContent className="p-4">
                {/* Messages */}
                <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4">
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
                    <ThinkingIndicator />
                  ) : nextQuestion ? (
                    <ChatMessage role="assistant" content={nextQuestion} />
                  ) : null}

                  <div ref={messagesEndRef} />
                </div>

                {/* Error message */}
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}

                {/* Completed state */}
                {isCompleted ? (
                  <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 text-emerald-700">
                    <CheckIcon />
                    <span>深掘りが完了しました！右側の「ESを作成」ボタンで志望動機ESを作成できます。</span>
                  </div>
                ) : (
                  /* Input area */
                  <ChatInput
                    value={answer}
                    onChange={setAnswer}
                    onSend={handleSend}
                    disabled={isSending || !nextQuestion}
                    placeholder="回答を入力..."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
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
                  disabled={isGeneratingDraft || messages.length < 2}
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
