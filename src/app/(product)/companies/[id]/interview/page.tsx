"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { ChatInput, ChatMessage, ThinkingIndicator } from "@/components/chat";
import { DashboardHeader } from "@/components/dashboard";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import { InterviewConversationSkeleton } from "@/components/skeletons/InterviewConversationSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import {
  DEFAULT_INTERVIEW_QUESTION_COUNT,
  INTERVIEW_STAGE_ORDER,
  type InterviewStage,
  type InterviewStageStatus,
} from "@/lib/interview/session";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type MaterialCard = {
  label: string;
  text: string;
  kind?: "motivation" | "gakuchika" | "es";
};

type Feedback = {
  overall_comment: string;
  scores: {
    company_fit?: number;
    specificity?: number;
    logic?: number;
    persuasiveness?: number;
  };
  strengths: string[];
  improvements: string[];
  improved_answer: string;
  preparation_points: string[];
};

type PendingCompleteData = {
  messages: Message[];
  questionCount: number;
  stageStatus: InterviewStageStatus | null;
  questionStage: InterviewStage | null;
  focus: string | null;
  feedback: Feedback | null;
  questionFlowCompleted: boolean;
  creditCost: number;
};

const STORAGE_PREFIX = "company-interview-session";
const STAGE_LABELS: Record<InterviewStage, string> = {
  opening: "導入",
  company_understanding: "企業理解",
  experience: "経験・ガクチカ",
  motivation_fit: "志望動機・適合",
  feedback: "最終講評",
};

function scoreEntries(feedback: Feedback | null) {
  if (!feedback) return [];
  return [
    ["企業適合", feedback.scores.company_fit ?? 0],
    ["具体性", feedback.scores.specificity ?? 0],
    ["論理性", feedback.scores.logic ?? 0],
    ["説得力", feedback.scores.persuasiveness ?? 0],
  ] as const;
}

function InterviewStageTracker({
  stageStatus,
  questionCount,
}: {
  stageStatus: InterviewStageStatus | null;
  questionCount: number;
}) {
  if (!stageStatus) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {Math.min(questionCount, DEFAULT_INTERVIEW_QUESTION_COUNT)} / {DEFAULT_INTERVIEW_QUESTION_COUNT}問
        </p>
      </div>
      <div className="space-y-2">
        {INTERVIEW_STAGE_ORDER.map((stage) => {
          const isCurrent = stageStatus.current === stage;
          const isCompleted = stageStatus.completed.includes(stage);
          return (
            <div
              key={stage}
              className={cn(
                "rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm transition-colors",
                isCurrent && "border-sky-300 bg-sky-50 text-slate-900",
                isCompleted && "border-emerald-200 bg-emerald-50 text-emerald-900",
                !isCurrent && !isCompleted && "border-border/60 bg-muted/20 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{STAGE_LABELS[stage]}</span>
                <span>{isCompleted ? "完了" : isCurrent ? "進行中" : "未着手"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterviewMaterialsCard({ materials }: { materials: MaterialCard[] }) {
  const visibleMaterials = materials.slice(0, 3);

  return (
    <div className="space-y-2">
      {materials.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          志望動機、ガクチカ、関連 ES がまだ少ないため、企業情報を軸に質問を組み立てます。
        </p>
      ) : (
        <>
          {visibleMaterials.map((material) => (
            <ReferenceSourceCard
              key={`${material.kind ?? material.label}-${material.label}`}
              title={material.label}
              meta={
                material.kind === "motivation"
                  ? "志望動機"
                  : material.kind === "gakuchika"
                    ? "ガクチカ"
                    : material.kind === "es"
                      ? "ES"
                      : null
              }
              compact
              excerpt={
                <p className="text-[11px] leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] overflow-hidden">
                  {material.text}
                </p>
              }
            />
          ))}
          {materials.length > visibleMaterials.length ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              他 {materials.length - visibleMaterials.length} 件の材料があります。
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function ResetConversationButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled} className="h-9 rounded-xl px-3 text-xs shadow-sm">
      会話をやり直す
    </Button>
  );
}

function InterviewFeedbackCard({ feedback }: { feedback: Feedback }) {
  const scoreRows = scoreEntries(feedback);

  return (
    <Card className="border-border/50">
      <CardHeader className="py-4">
        <CardTitle className="text-sm font-medium">最終講評</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <p className="text-sm leading-6">{feedback.overall_comment}</p>

        <div className="grid grid-cols-2 gap-3">
          {scoreRows.map(([label, score]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">{score}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-medium">良かった点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.strengths.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium">改善点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.improvements.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium">言い換え例</p>
          <p className="mt-2 rounded-xl bg-muted px-4 py-3 text-sm leading-6">
            {feedback.improved_answer}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">次に準備すべき論点</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {feedback.preparation_points.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompanyInterviewPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { isReady, isAuthenticated } = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [materials, setMaterials] = useState<MaterialCard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [creditCost, setCreditCost] = useState(5);
  const [questionCount, setQuestionCount] = useState(0);
  const [questionStage, setQuestionStage] = useState<InterviewStage | null>(null);
  const [stageStatus, setStageStatus] = useState<InterviewStageStatus | null>(null);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [questionFlowCompleted, setQuestionFlowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `${STORAGE_PREFIX}:${companyId}`;
  const hasStarted = messages.length > 0 || feedback !== null;
  const isBusy = isStarting || isSending || isGeneratingFeedback;
  const isComplete = feedback !== null;

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    let isMounted = true;
    const hydrate = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/companies/${companyId}/interview`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "INTERVIEW_HYDRATE_FAILED",
              userMessage: "面接対策の準備に失敗しました。",
              action: "時間をおいて、もう一度お試しください。",
              authMessage: "ログイン後に面接対策を利用してください。",
              notFoundMessage: "対象の企業が見つかりません。",
            },
            "interview:hydrate",
          );
        }
        const data = await response.json();

        if (!isMounted) return;
        setCompanyName(data.company?.name || "");
        setMaterials(Array.isArray(data.materials) ? data.materials : []);
        setCreditCost(typeof data.creditCost === "number" ? data.creditCost : 5);
        setStageStatus(data.stageStatus || null);

        const saved = window.sessionStorage.getItem(storageKey);
        if (!saved) return;
        const parsed = JSON.parse(saved) as {
          messages?: Message[];
          feedback?: Feedback | null;
          questionCount?: number;
          questionStage?: InterviewStage | null;
          stageStatus?: InterviewStageStatus | null;
          questionFlowCompleted?: boolean;
        };
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
        }
        if (parsed.feedback) {
          setFeedback(parsed.feedback);
        }
        if (typeof parsed.questionCount === "number") {
          setQuestionCount(parsed.questionCount);
        }
        if (parsed.questionStage) {
          setQuestionStage(parsed.questionStage);
        }
        if (parsed.stageStatus) {
          setStageStatus(parsed.stageStatus);
        }
        if (typeof parsed.questionFlowCompleted === "boolean") {
          setQuestionFlowCompleted(parsed.questionFlowCompleted);
        }
      } catch (fetchError) {
        if (!isMounted) return;
        const uiError = toAppUiError(
          fetchError,
          {
            code: "INTERVIEW_HYDRATE_FAILED",
            userMessage: "面接対策の準備に失敗しました。",
            action: "時間をおいて、もう一度お試しください。",
          },
          "interview:hydrate",
        );
        setError(uiError.message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [companyId, isAuthenticated, isReady, storageKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        messages,
        feedback,
        questionCount,
        questionStage,
        stageStatus,
        questionFlowCompleted,
      }),
    );
  }, [feedback, isAuthenticated, messages, questionCount, questionFlowCompleted, questionStage, stageStatus, storageKey]);

  const canSend = answer.trim().length > 0 && !isBusy && !isComplete && !questionFlowCompleted && hasStarted;
  const canGenerateFeedback = questionFlowCompleted && !isComplete && !isBusy;
  const statusCaption = useMemo(() => {
    if (feedback) {
      return "講評完了";
    }
    if (questionFlowCompleted) {
      return "面接完了";
    }
    if (questionStage) {
      return STAGE_LABELS[questionStage];
    }
    return "開始前";
  }, [feedback, questionFlowCompleted, questionStage]);
  const feedbackHelperText = questionFlowCompleted
    ? `5問の回答をもとに最終講評を作成します。成功時のみ ${creditCost} credits 消費です。`
    : "5問完了後に最終講評を作成できます。";

  async function runStream(
    path:
      | "/api/companies/[id]/interview/start"
      | "/api/companies/[id]/interview/stream"
      | "/api/companies/[id]/interview/feedback",
    body?: { messages: Message[] },
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let pendingCompleteData: PendingCompleteData | null = null;

    try {
      const resolvedPath =
        path === "/api/companies/[id]/interview/start"
          ? `/api/companies/${companyId}/interview/start`
          : path === "/api/companies/[id]/interview/feedback"
            ? `/api/companies/${companyId}/interview/feedback`
            : `/api/companies/${companyId}/interview/stream`;
      const response = await fetch(resolvedPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "INTERVIEW_STREAM_FAILED",
            userMessage: "面接対策の送信に失敗しました。",
            action: "少し時間をおいて、もう一度お試しください。",
            authMessage: "ログイン後に面接対策を利用してください。",
          },
          "interview:stream",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ストリームが取得できませんでした。");
      }

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
            continue;
          }

          if (event.type === "string_chunk") {
            setIsTextStreaming(true);
            setStreamingAssistantText((prev) => prev + (event.text || ""));
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message || "AIサービスでエラーが発生しました。");
          }

          if (event.type === "complete") {
            completed = true;
            const data = event.data || {};
            pendingCompleteData = {
              messages: Array.isArray(data.messages) ? data.messages : [],
              questionCount: typeof data.questionCount === "number" ? data.questionCount : 0,
              stageStatus: data.stageStatus || null,
              questionStage: data.questionStage || null,
              focus: data.focus || null,
              feedback: data.feedback || null,
              questionFlowCompleted:
                Boolean(data.questionFlowCompleted) || Boolean(data.feedback),
              creditCost: typeof data.creditCost === "number" ? data.creditCost : creditCost,
            };
          }
        }
      }

      if (!completed || !pendingCompleteData) {
        throw new Error("ストリームが途中で切断されました。");
      }

      const completeData = pendingCompleteData;

      startTransition(() => {
        setMessages(completeData.messages);
        setQuestionCount(completeData.questionCount);
        setStageStatus(completeData.stageStatus);
        setQuestionStage(completeData.questionStage);
        setFeedback(completeData.feedback);
        setQuestionFlowCompleted(completeData.questionFlowCompleted);
        setCreditCost(completeData.creditCost);
      });
    } finally {
      clearTimeout(timeoutId);
      setStreamingLabel(null);
      setStreamingAssistantText("");
      setIsTextStreaming(false);
    }
  }

  const handleStart = async () => {
    if (isBusy || hasStarted) return;
    setIsStarting(true);
    setError(null);
    try {
      await runStream("/api/companies/[id]/interview/start");
    } catch (streamError) {
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_START_FAILED",
          userMessage: "面接対策の開始に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:start",
      );
      setError(uiError.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;

    const userMessage: Message = { role: "user", content: answer.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setAnswer("");
    setIsSending(true);
    setError(null);

    try {
      await runStream("/api/companies/[id]/interview/stream", {
        messages: nextMessages,
      });
    } catch (streamError) {
      setMessages(messages);
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_SEND_FAILED",
          userMessage: "面接対策の送信に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:send",
      );
      setError(uiError.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateFeedback = async () => {
    if (!canGenerateFeedback) return;

    setIsGeneratingFeedback(true);
    setError(null);
    try {
      await runStream("/api/companies/[id]/interview/feedback", {
        messages,
      });
    } catch (streamError) {
      const uiError = toAppUiError(
        streamError,
        {
          code: "INTERVIEW_FEEDBACK_FAILED",
          userMessage: "最終講評の作成に失敗しました。",
          action: "少し時間をおいて、もう一度お試しください。",
        },
        "interview:feedback",
      );
      setError(uiError.message);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setFeedback(null);
    setAnswer("");
    setError(null);
    setQuestionCount(0);
    setQuestionStage(null);
    setStageStatus(null);
    setStreamingLabel(null);
    setStreamingAssistantText("");
    setIsTextStreaming(false);
    setQuestionFlowCompleted(false);
    window.sessionStorage.removeItem(storageKey);
  };

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main>
          <InterviewConversationSkeleton accent="面接の準備を進めています" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginRequiredForAi title="面接対策はログイン後に利用できます" />;
  }

  if (isStarting && !hasStarted) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main>
          <InterviewConversationSkeleton accent="初回質問を生成しています" />
        </main>
      </div>
    );
  }

  return (
    <ConversationWorkspaceShell
      backHref={`/companies/${companyId}`}
      title="面接対策"
      subtitle={companyName || "企業特化模擬面接"}
      actionBar={
        <ConversationActionBar
          helperText={feedbackHelperText}
          actionLabel="最終講評を作成"
          pendingLabel="講評を作成中..."
          onAction={handleGenerateFeedback}
          disabled={!canGenerateFeedback}
          isPending={isGeneratingFeedback}
        />
      }
      mobileStatus={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{statusCaption}</span>
          <span>
            {questionCount > 0
              ? `${Math.min(questionCount, DEFAULT_INTERVIEW_QUESTION_COUNT)} / ${DEFAULT_INTERVIEW_QUESTION_COUNT}問`
              : "開始前"}
          </span>
        </div>
      }
      conversation={
        !hasStarted ? (
          <div className="flex h-full flex-col justify-between gap-6 px-3 py-2 sm:px-4">
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-5 py-4">
                <p className="text-sm leading-7 text-foreground/90">
                  保存済みの志望動機、ガクチカ、関連 ES と企業情報を踏まえて、この企業向けの模擬面接を 5 問で進めます。回答がそろったら、上部から最終講評を作成できます。
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">この画面で進むこと</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• 導入から志望動機・適合まで、段階ごとに質問を固定順で進めます。</li>
                  <li>• 右カラムで進行段階と参考材料を確認しながら回答できます。</li>
                  <li>• 5問完了後に、最終講評を必要なタイミングで作成できます。</li>
                </ul>
              </div>
            </div>
            <div className="space-y-3">
              <Button onClick={handleStart} disabled={isBusy} className="w-full sm:w-auto">
                面接対策を始める
              </Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                role={message.role}
                content={message.content}
              />
            ))}

            {isBusy && !isTextStreaming ? (
              <ThinkingIndicator
                text={
                  streamingLabel ||
                  (isGeneratingFeedback ? "最終講評をまとめています" : "次の質問を考え中")
                }
              />
            ) : null}

            {isTextStreaming ? (
              <ChatMessage role="assistant" content={streamingAssistantText} isStreaming />
            ) : null}

            {questionFlowCompleted && !feedback ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
                5問の回答が完了しました。内容を振り返ったうえで、上部の「最終講評を作成」から講評を生成できます。
              </div>
            ) : null}

            {feedback ? <InterviewFeedbackCard feedback={feedback} /> : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )
      }
      composer={
        hasStarted && !isComplete ? (
          questionFlowCompleted ? (
            <p className="text-sm text-muted-foreground">
              回答はここで完了です。必要になったら上部のボタンから最終講評を作成してください。
            </p>
          ) : (
            <ChatInput
              value={answer}
              onChange={setAnswer}
              onSend={handleSend}
              isSending={isBusy}
              disableSend={!canSend}
              placeholder="回答を入力..."
              className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
            />
          )
        ) : undefined
      }
      sidebar={
        <>
          <ConversationSidebarCard
            title="進捗"
            actions={<ResetConversationButton onClick={handleReset} disabled={isBusy} />}
          >
            <InterviewStageTracker stageStatus={stageStatus} questionCount={questionCount} />
          </ConversationSidebarCard>
          <ConversationSidebarCard title="参考にする材料">
            <InterviewMaterialsCard materials={materials} />
          </ConversationSidebarCard>
        </>
      }
    />
  );
}
