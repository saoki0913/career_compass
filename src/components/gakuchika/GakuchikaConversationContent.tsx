"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChatInput,
  ChatMessage,
  ConversationPhaseBar,
  ConversationProgressBar,
  ThinkingIndicator,
} from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import { CharLimitSelector } from "@/components/chat/CharLimitSelector";
import { GeneratedDraftActionCard } from "@/components/chat/GeneratedDraftActionCard";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { useGakuchikaConversationController } from "@/features/gakuchika/hooks/useGakuchikaConversationController";
import { useGakuchikaViewModel } from "@/features/gakuchika/hooks/useGakuchikaViewModel";
import {
  CompletionSummary,
  GakuchikaRestartConfirmDialog,
} from "@/components/gakuchika";
import { DraftPreviewModal } from "@/components/chat/DraftPreviewModal";
import { GakuchikaStartScreen } from "@/components/gakuchika/GakuchikaStartScreen";
import { notifyGakuchikaDraftSaved } from "@/lib/notifications";
import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";
import {
  BUILD_TRACK_KEYS,
  BUILD_TRACK_LABELS,
  getBuildItemStatus,
  getConversationBadgeLabel,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";
import { PROCESSING_LABELS } from "@/features/gakuchika/domain/ui";

type GakuchikaConversationContentProps = {
  gakuchikaId: string;
};

function stageRemainingLabel(state: ConversationState | null): string | null {
  if (!state) return null;
  if (state.stage === "interview_ready") {
    return "面接準備まで整いました。";
  }
  if (state.stage === "deep_dive_active") {
    return "深掘りで論点を整理しています。";
  }
  if (state.stage === "draft_ready" || state.readyForDraft) {
    return "ES 材料が揃いました。";
  }
  return null;
}

function estimateRemainingQuestionsText(state: ConversationState | null): string | null {
  if (!state) return null;
  const stageLabel = stageRemainingLabel(state);
  if (stageLabel) return stageLabel;
  const remaining = state.missingElements.length;
  if (remaining === 0) return "まもなく材料が揃います。";
  if (remaining === 1) return "あと 1 問程度で材料が揃います。";
  if (remaining === 2) return "あと 1-2 問で材料が揃いそうです。";
  return "STAR の材料を順に整理していきましょう。";
}

function remainingLabelFromServerCount(state: ConversationState | null, n: number): string {
  const stageLabel = stageRemainingLabel(state);
  if (stageLabel) return stageLabel;
  if (n <= 0) return "まもなく材料が揃います。";
  if (n === 1) return "あと 1 問で材料が揃います。";
  return `あと ${n} 問で材料が揃いそうです。`;
}

function estimateTotalQuestionCount(
  answeredCount: number,
  remainingLabel: string | null,
  serverRemaining: number | null,
): number {
  const baseline = 5;
  if (serverRemaining !== null) {
    if (serverRemaining === 0) {
      return Math.max(answeredCount, baseline);
    }
    return Math.max(baseline, answeredCount + serverRemaining);
  }
  const grown = Math.max(baseline, answeredCount + 2);
  if (remainingLabel && /整いました|揃いました|整理しています/.test(remainingLabel)) {
    return Math.max(answeredCount, baseline);
  }
  return grown;
}

export function GakuchikaConversationContent({ gakuchikaId }: GakuchikaConversationContentProps) {
  const router = useRouter();
  const { state, actions } = useGakuchikaConversationController({
    gakuchikaId,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    nextQuestion,
    questionCount,
    isLoading,
    isSending,
    isWaitingForResponse,
    answer,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    isResumingSession,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
    isSummaryLoading,
    summaryRequested,
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
    currentSessionLabel,
    isDraftModalOpen,
    generatedDraftText,
    generatedDocumentId,
    generatedDraftQuality,
    gakuchikaDraftHelperText,
  } = state;
  const {
    setAnswer,
    setShowStarInfo,
    retrySummary: handleRetrySummary,
    startDeepDive: handleStartDeepDive,
    send: handleSend,
    selectSession: handleSessionSelect,
    resumeSession: handleResumeSession,
    discardDraftAndResumeSession: handleDiscardDraftAndResumeSession,
    generateDraft: handleGenerateDraft,
    restartConversation: handleRestartConversation,
    confirmRestartConversation: handleConfirmRestartConversation,
    setRestartDialogOpen,
    setDraftCharLimit,
    setIsDraftModalOpen,
  } = actions;

  const { answeredCount, thinkingContextLabel } = useGakuchikaViewModel({
    messages,
    conversationState,
  });
  const buildTrackStages = useMemo(
    () =>
      BUILD_TRACK_KEYS.map((key) => ({
        key,
        label: BUILD_TRACK_LABELS[key],
        status: getBuildItemStatus(conversationState, key),
      })),
    [conversationState],
  );
  const serverRemaining = conversationState?.remainingQuestionsEstimate ?? null;
  const effectiveRemaining =
    typeof serverRemaining === "number" && Number.isFinite(serverRemaining) && serverRemaining >= 0
      ? Math.floor(serverRemaining)
      : null;
  const remainingLabel =
    effectiveRemaining !== null
      ? remainingLabelFromServerCount(conversationState, effectiveRemaining)
      : estimateRemainingQuestionsText(conversationState);
  const coachMessage = conversationState?.coachProgressMessage?.trim() ?? "";
  const primaryLine = coachMessage || remainingLabel || "";
  const estimatedTotal = estimateTotalQuestionCount(answeredCount, remainingLabel, effectiveRemaining);
  const questionDisplay =
    answeredCount > 0
      ? `${Math.min(answeredCount, estimatedTotal)} 問目 / 約 ${estimatedTotal} 問`
      : "これから 1 問目";
  const gakuchikaPhases = useMemo(() => {
    const currentStage = conversationState?.stage ?? "es_building";
    const phases = [
      { key: "es_building", label: "Q&A進行中" },
      { key: "draft_ready", label: "ES作成可" },
      { key: "deep_dive_active", label: "深掘り中" },
      { key: "interview_ready", label: "面接準備完了" },
    ] as const;
    const currentIndex = Math.max(
      0,
      phases.findIndex((phase) => phase.key === currentStage),
    );
    return phases.map((phase, index) => ({
      ...phase,
      status: index < currentIndex ? "done" as const : index === currentIndex ? "current" as const : "pending" as const,
    }));
  }, [conversationState?.stage]);
  const pausedQuestion = conversationState?.pausedQuestion?.trim() || null;
  const displayedNextQuestion = nextQuestion || (shouldPauseConversation ? pausedQuestion : null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantPhase, displayedNextQuestion, messages, streamingText, isTextStreaming]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <GakuchikaDeepDiveSkeleton accent="ガクチカ作成の材料を読み込んでいます" />
      </div>
    );
  }

  if (!conversationStarted) {
    return (
      <div className="min-h-screen bg-background">
        <GakuchikaStartScreen
          title={gakuchikaTitle}
          content={gakuchikaContent}
          showStarInfo={showStarInfo}
          isStarting={isStarting}
          onShowStarInfoChange={setShowStarInfo}
          onStartDeepDive={handleStartDeepDive}
        />
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
        generatedDraftText && generatedDocumentId ? (
          <GeneratedDraftActionCard
            draft={generatedDraftText}
            charLimit={draftCharLimit}
            documentId={generatedDocumentId}
            onOpenPreview={() => setIsDraftModalOpen(true)}
            isBusy={isGeneratingDraft || isSending || isResumingSession}
          />
        ) : (
          <ConversationActionBar
            actionLabel="ガクチカESを作成"
            pendingLabel="作成中..."
            onAction={handleGenerateDraft}
            disabled={!draftReady || isGeneratingDraft || interviewReady}
            isPending={isGeneratingDraft}
            controls={
              <CharLimitSelector
                value={draftCharLimit}
                onChange={setDraftCharLimit}
                disabled={isGeneratingDraft}
              />
            }
          />
        )
      }
      mobileStatus={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {currentSessionLabel ? (
              <Badge variant="outline" className="px-2 py-0 text-[11px]">
                {currentSessionLabel}
              </Badge>
            ) : null}
            <Badge variant={isAIPowered ? "soft-primary" : "outline"} className="px-2 py-0 text-[11px]">
              {isAIPowered ? "AI" : "基本"}
            </Badge>
          </div>
          <ConversationProgressBar
            stages={buildTrackStages}
            headerSubtext={questionDisplay}
            footerMessage={primaryLine}
            variant="inline"
            columns={4}
          />
          <div className="grid gap-2 lg:grid-cols-2 xl:hidden">
            {sessions.length > 1 ? (
              <details className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-foreground">セッション履歴</summary>
                <div className="mt-2 space-y-2">
                  {isGeneratingDraft ? (
                    <p className="text-muted-foreground">ES生成中はセッションを切り替えられません。</p>
                  ) : null}
                  {!isGeneratingDraft
                    ? sessions.map((session, index) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            if (isSending || isResumingSession) return;
                            void handleSessionSelect(session.id);
                          }}
                          disabled={isSending || isResumingSession}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                            session.id === currentSessionId
                              ? "border-primary/40 bg-primary/5 text-foreground"
                              : "border-border/60 text-muted-foreground hover:text-foreground",
                            (isSending || isResumingSession) && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <span className="font-medium">#{sessions.length - index}</span>
                          <span>{getConversationBadgeLabel(session.status, session.conversationState)}</span>
                        </button>
                      ))
                    : null}
                </div>
              </details>
            ) : null}
            <details className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">作成メモ</summary>
              <div className="mt-2 space-y-1">
                <p className="font-medium text-foreground">{gakuchikaTitle}</p>
                <p className="line-clamp-4 leading-5 text-muted-foreground">
                  {gakuchikaContent || "テーマのみ登録されています。会話で内容を膨らませていきます。"}
                </p>
              </div>
            </details>
          </div>
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
              contextLabel={thinkingContextLabel}
            />
          ) : null}

          {isTextStreaming ? (
            <StreamingChatMessage streamingText={streamingText} isStreaming={true} />
          ) : null}

          {displayedNextQuestion &&
          !isWaitingForResponse &&
          !isTextStreaming &&
          !(messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].content === displayedNextQuestion) ? (
            <ChatMessage role="assistant" content={displayedNextQuestion} />
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
              summaryRequested={summaryRequested}
              hideGenerateAction
            />
          ) : shouldPauseConversation ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">
                {generatedDraft
                  ? "ESを生成しました。生成案のモーダルから深掘りを続ける場合、このES下書きは削除されます。"
                  : "材料が揃いました。ESを作成するか、深掘りを続けて強化できます。"}
              </p>
              <Button
                variant={isResumingSession ? "default" : "outline"}
                size="sm"
                onClick={handleResumeSession}
                disabled={isStarting || isSending || isGeneratingDraft || isResumingSession}
                className="shrink-0 rounded-xl shadow-sm active:translate-y-px"
              >
                {isResumingSession ? "再開中..." : "深掘りを続ける"}
              </Button>
            </div>
          ) : null}
        </div>
      }
      composer={
        !interviewReady && !shouldPauseConversation ? (
          <div className="space-y-3">
            {conversationState?.answerHint ? (
              <div
                className="inline-flex max-w-full items-start gap-2 rounded-xl border border-primary/10 bg-primary/5 px-3 py-2 text-[12px] leading-5 text-foreground/85"
                role="note"
                aria-label="回答のヒント"
              >
                <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
                <span>{conversationState.answerHint}</span>
              </div>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestartConversation}
                  disabled={isStarting || isSending || isGeneratingDraft || isResumingSession}
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
              <ConversationProgressBar
                stages={buildTrackStages}
                headerSubtext={questionDisplay}
                footerMessage={primaryLine}
                columns={4}
              />
              <ConversationPhaseBar phases={gakuchikaPhases} />
              <p className="text-xs leading-5 text-muted-foreground">
                {interviewReady && conversationState?.progressLabel
                  ? `${conversationState.progressLabel}。`
                  : gakuchikaDraftHelperText}
              </p>
            </div>
          </ConversationSidebarCard>

          {sessions.length > 1 ? (
            <ConversationSidebarCard title="セッション履歴">
              <div className="space-y-2">
                {isGeneratingDraft ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    ES生成中はセッションを切り替えられません。
                  </p>
                ) : null}
                {!isGeneratingDraft
                  ? sessions.map((session, index) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          if (isSending || isResumingSession) return;
                          void handleSessionSelect(session.id);
                        }}
                        disabled={isSending || isResumingSession}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left text-xs transition-colors",
                          session.id === currentSessionId
                            ? "border-primary/40 bg-primary/5 text-foreground"
                            : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                          (isSending || isResumingSession) && "cursor-not-allowed opacity-60 hover:text-muted-foreground",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">#{sessions.length - index}</span>
                          <span>{getConversationBadgeLabel(session.status, session.conversationState)}</span>
                        </div>
                      </button>
                    ))
                  : null}
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
    <DraftPreviewModal
      isOpen={isDraftModalOpen}
      title="生成したガクチカES"
      description="内容を確認して開くか、現在の下書きを削除して深掘りから作り直せます。"
      draft={generatedDraftText ?? ""}
      charLimit={draftCharLimit}
      draftQuality={generatedDraftQuality}
      isSaving={false}
      primaryLabel="ESを開く"
      onPrimary={() => {
        setIsDraftModalOpen(false);
        if (generatedDocumentId) {
          notifyGakuchikaDraftSaved();
          router.push(`/es/${generatedDocumentId}`);
        }
      }}
      onDeepDive={async () => {
        setIsDraftModalOpen(false);
        await handleDiscardDraftAndResumeSession();
      }}
      onClose={() => setIsDraftModalOpen(false)}
      deepDiveConfirm={{
        title: "このES下書きを削除しますか？",
        description: "深掘りを再開すると、今表示しているES下書きは削除されます。削除後は会話を続けてから再生成します。",
        confirmLabel: "削除して深掘りする",
      }}
      preBodyNotice={
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          「もっと深掘りして再生成する」を選ぶと、今表示しているES下書きは削除されます。残したい場合は先にESを開いてください。
        </div>
      }
    />
    </>
  );
}
