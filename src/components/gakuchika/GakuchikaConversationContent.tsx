"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChatInput,
  ChatMessage,
  ConversationMobileStatus,
  ConversationRestartConfirmDialog,
  ConversationSummaryDialog,
  EsDraftSettingsDialog,
  ReadyOutputBar,
  ThinkingIndicator,
} from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { ConversationWorkspaceShell } from "@/components/chat/ConversationWorkspaceShell";
import { useGakuchikaConversationController } from "@/features/gakuchika/hooks/useGakuchikaConversationController";
import { useGakuchikaViewModel } from "@/features/gakuchika/hooks/useGakuchikaViewModel";
import { CompletionSummary } from "@/components/gakuchika";
import { DraftPreviewModal } from "@/components/chat/DraftPreviewModal";
import { GakuchikaStartScreen } from "@/components/gakuchika/GakuchikaStartScreen";
import { GakuchikaConversationSidebar } from "@/components/gakuchika/GakuchikaConversationSidebar";
import { notifyGakuchikaDraftSaved } from "@/lib/notifications";
import { GakuchikaDeepDiveSkeleton } from "@/components/skeletons/GakuchikaDeepDiveSkeleton";
import {
  BUILD_TRACK_KEYS,
  BUILD_TRACK_LABELS,
  getBuildItemStatus,
  getConversationBadgeLabel,
} from "@/lib/gakuchika/conversation-state";
import { PROCESSING_LABELS } from "@/features/gakuchika/domain/ui";

type GakuchikaConversationContentProps = {
  gakuchikaId: string;
};

export function GakuchikaConversationContent({ gakuchikaId }: GakuchikaConversationContentProps) {
  const router = useRouter();
  const { state, actions } = useGakuchikaConversationController({
    gakuchikaId,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [esDraftDialogOpen, setEsDraftDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
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
    discardDraftAndResumeSession: handleDiscardDraftAndResumeSession,
    generateDraft: handleGenerateDraft,
    restartConversation: handleRestartConversation,
    confirmRestartConversation: handleConfirmRestartConversation,
    setRestartDialogOpen,
    setDraftCharLimit,
    setIsDraftModalOpen,
  } = actions;

  const { thinkingContextLabel, primaryLine, questionDisplay } = useGakuchikaViewModel({
    messages,
    conversationState,
    questionCount,
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
  const pausedQuestion = conversationState?.pausedQuestion?.trim() || null;
  const displayedNextQuestion = nextQuestion || pausedQuestion;
  const openSummaryDialog = () => {
    setSummaryDialogOpen(true);
    if (!summaryRequested && !summary && !isSummaryLoading) {
      void handleRetrySummary();
    }
  };
  const readyOutputActions = [
    {
      key: "draft",
      label: "ES作成",
      description: draftReady
        ? generatedDraftText && generatedDocumentId
          ? "生成済みESを開く"
          : "文字数を選んで生成"
        : "材料が揃うと利用できます",
      icon: "draft" as const,
      disabled: !draftReady || isGeneratingDraft || isSending || isResumingSession,
      pending: isGeneratingDraft,
      onClick: () => {
        if (generatedDraftText && generatedDocumentId) {
          setIsDraftModalOpen(true);
          return;
        }
        setEsDraftDialogOpen(true);
      },
    },
    {
      key: "feedback",
      label: "フィードバック生成",
      description: interviewReady ? "面接で話す要点を整理" : "面接向けの深掘り完了後に利用できます",
      icon: "feedback" as const,
      disabled: !interviewReady || isSummaryLoading || isSending || isResumingSession,
      pending: isSummaryLoading,
      onClick: openSummaryDialog,
    },
  ];

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
        <ReadyOutputBar
          actions={readyOutputActions}
          compact
          helperText={generatedDraftText && generatedDocumentId ? "生成済みのESを確認できます。" : undefined}
        />
      }
      mobileStatus={
        <ConversationMobileStatus
          stages={buildTrackStages}
          headerSubtext={questionDisplay}
          footerMessage={primaryLine}
          columns={4}
          badges={
            <>
              {currentSessionLabel ? (
                <Badge variant="outline" className="px-2 py-0 text-[11px]">
                  {currentSessionLabel}
                </Badge>
              ) : null}
              <Badge variant={isAIPowered ? "soft-primary" : "outline"} className="px-2 py-0 text-[11px]">
                {isAIPowered ? "AI" : "基本"}
              </Badge>
            </>
          }
        >
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
        </ConversationMobileStatus>
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
        </div>
      }
      composer={
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
      }
      sidebar={
        <GakuchikaConversationSidebar
          isAIPowered={isAIPowered}
          currentSessionLabel={currentSessionLabel}
          buildTrackStages={buildTrackStages}
          questionDisplay={questionDisplay}
          primaryLine={primaryLine}
          helperText={gakuchikaDraftHelperText}
          conversationState={conversationState}
          generatedDraft={generatedDraft}
          sessions={sessions}
          currentSessionId={currentSessionId}
          gakuchikaTitle={gakuchikaTitle}
          gakuchikaContent={gakuchikaContent}
          interviewReady={interviewReady}
          isGeneratingDraft={isGeneratingDraft}
          isSending={isSending}
          isResumingSession={isResumingSession}
          isStarting={isStarting}
          onRestartConversation={handleRestartConversation}
          onSessionSelect={handleSessionSelect}
        />
      }
    />
    <ConversationRestartConfirmDialog
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
    <EsDraftSettingsDialog
      open={esDraftDialogOpen}
      onOpenChange={setEsDraftDialogOpen}
      description="ガクチカの深掘り内容からESを生成します。"
      value={draftCharLimit}
      onValueChange={setDraftCharLimit}
      isGenerating={isGeneratingDraft}
      onGenerate={() => {
        setEsDraftDialogOpen(false);
        void handleGenerateDraft();
      }}
      materialItems={[
        { title: "深掘り会話", description: "これまでの対話内容" },
        { title: "状況・課題・行動・結果", description: "整理されたエピソードの構成要素" },
        { title: "数字・成果", description: "定量的な実績や具体的な数値" },
      ]}
    />
    <ConversationSummaryDialog
      open={summaryDialogOpen}
      onOpenChange={setSummaryDialogOpen}
      title="フィードバック生成結果"
      description="面接で使える話す核と補足材料を整理しました。"
    >
      <CompletionSummary
        summary={summary}
        isLoading={isSummaryLoading}
        gakuchikaId={gakuchikaId}
        onRetrySummary={handleRetrySummary}
        summaryRequested={summaryRequested}
        hideGenerateAction
      />
    </ConversationSummaryDialog>
    </>
  );
}
