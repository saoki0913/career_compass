"use client";

import { useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { useGakuchikaConversationController } from "@/hooks/useGakuchikaConversationController";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import {
  CompletionSummary,
  GakuchikaRestartConfirmDialog,
  STAR_EXPLANATIONS,
  STARProgressBar,
  type ConversationState,
} from "@/components/gakuchika";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";
import {
  getConversationBadgeLabel,
  hasDraftText,
} from "@/lib/gakuchika/conversation-state";
import { PROCESSING_LABELS, type GakuchikaDraftCharLimit } from "@/lib/gakuchika/ui";

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

function DraftReadyPanel({
  state,
  draftCharLimit,
  onDraftCharLimitChange,
  onGenerateDraft,
  onContinueRefining,
  onResumeSession,
}: {
  state: ConversationState | null;
  draftCharLimit: GakuchikaDraftCharLimit;
  onDraftCharLimitChange: (n: GakuchikaDraftCharLimit) => void;
  onGenerateDraft?: () => void;
  onContinueRefining?: () => void;
  onResumeSession?: () => void;
}) {
  const hasDraft = hasDraftText(state);
  const recommendations = (state?.deepdiveRecommendationTags ?? []).slice(0, 3);
  const recommendationLabels: Record<string, string> = {
    deepen_action_reason: "行動の判断理由を補う",
    result_traceability_check: "成果とのつながりを補う",
    collect_result_evidence: "成果の根拠を補う",
    clarify_role_scope: "役割範囲を明確にする",
    learning_transfer: "学びの再現性を補う",
    deepen_learning_transfer: "学びを次の行動につなげる",
  };
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

        {recommendations.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-xs font-medium text-foreground">次に深掘りするとよい点</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {recommendations.map((tag) => (
                <li key={tag}>{recommendationLabels[tag] || tag}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!hasDraft && onGenerateDraft ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">ES の目安文字数</p>
            <div className="flex flex-wrap gap-2">
              {([300, 400, 500] as const).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={draftCharLimit === n ? "default" : "outline"}
                  size="sm"
                  className="h-9 rounded-xl px-3 text-xs"
                  onClick={() => onDraftCharLimitChange(n)}
                >
                  {n} 字
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!hasDraft && onGenerateDraft ? (
            <Button onClick={onGenerateDraft}>ガクチカESを作成</Button>
          ) : null}
          {!hasDraft && onContinueRefining ? (
            <Button variant="outline" onClick={onContinueRefining}>
              もう少し整える
            </Button>
          ) : null}
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
  const handleDraftGenerated = useCallback((documentId: string) => {
    router.push(`/es/${documentId}`);
  }, [router]);
  const { state, actions } = useGakuchikaConversationController({
    gakuchikaId,
    onDraftGenerated: handleDraftGenerated,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    nextQuestion,
    questionCount,
    isCompleted,
    isLoading,
    isSending,
    isWaitingForResponse,
    answer,
    error,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
    isSummaryLoading,
    sessions,
    assistantPhase,
    isTextStreaming,
    streamingText,
    isBufferingQuestionChunks,
    currentSessionId,
    isGeneratingDraft,
    restartDialogOpen,
    draftCharLimit,
    processingText,
    draftReady,
    interviewReady,
    generatedDraft,
    shouldPauseConversation,
    gakuchikaDraftHelperText,
    currentSessionLabel,
  } = state;
  const {
    setAnswer,
    setError,
    setIsLoading,
    setShowStarInfo,
    fetchConversation,
    retrySummary: handleRetrySummary,
    startDeepDive: handleStartDeepDive,
    send: handleSend,
    selectSession: handleSessionSelect,
    resumeSession: handleResumeSession,
    generateDraft: handleGenerateDraft,
    restartConversation: handleRestartConversation,
    confirmRestartConversation: handleConfirmRestartConversation,
    setRestartDialogOpen,
    setDraftCharLimit,
  } = actions;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantPhase, messages, nextQuestion, streamingText, isTextStreaming]);

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
    <>
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

          {isWaitingForResponse && !isTextStreaming && (processingText || isBufferingQuestionChunks) ? (
            <ThinkingIndicator
              text={
                processingText ||
                (isBufferingQuestionChunks ? PROCESSING_LABELS.generating_question : "次の質問を準備しています")
              }
            />
          ) : null}

          {isTextStreaming ? (
            <StreamingChatMessage streamingText={streamingText} isStreaming={true} />
          ) : null}

          {nextQuestion &&
          !shouldPauseConversation &&
          !isWaitingForResponse &&
          !isTextStreaming &&
          !(messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === nextQuestion) ? (
            <ChatMessage role="assistant" content={nextQuestion} />
          ) : null}

          <div ref={messagesEndRef} />

          {interviewReady ? (
            <CompletionSummary
              summary={summary}
              isLoading={isSummaryLoading}
              gakuchikaId={gakuchikaId}
              onResumeSession={handleResumeSession}
              resumeFromInterviewLabel="もっと深掘る"
              onRetrySummary={handleRetrySummary}
              hideGenerateAction
            />
          ) : shouldPauseConversation ? (
            <DraftReadyPanel
              state={conversationState}
              draftCharLimit={draftCharLimit}
              onDraftCharLimitChange={setDraftCharLimit}
              onGenerateDraft={!generatedDraft ? handleGenerateDraft : undefined}
              onContinueRefining={!generatedDraft ? handleResumeSession : undefined}
              onResumeSession={generatedDraft ? handleResumeSession : undefined}
            />
          ) : null}
        </div>
      }
      composer={
        !interviewReady && !shouldPauseConversation ? (
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
              disableSend={assistantPhase !== "idle" || isTextStreaming || isBufferingQuestionChunks}
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
                {!generatedDraft && draftReady ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResumeSession}
                    disabled={isStarting || isSending || isGeneratingDraft}
                    className="h-9 rounded-xl px-3 text-xs shadow-sm"
                  >
                    もう少し整える
                  </Button>
                ) : null}
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
              <STARProgressBar
                state={conversationState}
                status={interviewReady || isCompleted ? "completed" : "in_progress"}
              />
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
                        <span>{getConversationBadgeLabel(session.status, session.conversationState)}</span>
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
    <GakuchikaRestartConfirmDialog
      isOpen={restartDialogOpen}
      onCancel={() => setRestartDialogOpen(false)}
      onConfirm={handleConfirmRestartConversation}
      isConfirming={isStarting && restartDialogOpen}
    />
    </>
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
