"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { MotivationDraftModal } from "@/components/motivation/MotivationDraftModal";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import { MotivationConversationHeader } from "@/components/motivation/MotivationConversationHeader";
import { MotivationConversationSidebar } from "@/components/motivation/MotivationConversationSidebar";
import { MotivationSetupPanel } from "@/components/motivation/MotivationSetupPanel";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";
import { useMotivationConversationController } from "@/hooks/useMotivationConversationController";
import { useMotivationViewModel } from "@/hooks/motivation/useMotivationViewModel";
import { STAGE_LABELS } from "@/lib/motivation/ui";

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

const ResetIcon = () => (
  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3"
    />
  </svg>
);

export function MotivationConversationContent({ companyId }: { companyId: string }) {
  const router = useRouter();
  const {
    answer,
    causalGaps,
    charLimit,
    coachingFocus,
    company,
    conversationLoadError,
    conversationMode,
    currentIntent,
    currentSlot,
    customRoleInput,
    error,
    evidenceCards,
    evidenceSummary,
    fetchData,
    generatedDocumentId,
    generatedDraft,
    handleCloseDraftModal,
    handleGenerateDraft,
    handleGenerateDraftDirect,
    handleIndustryChange,
    handleResetConversation,
    handleResumeDeepDive,
    handleSaveGeneratedDraft,
    handleSend,
    handleStartConversation,
    isDraftModalOpen,
    isDraftReady,
    setIsDraftModalOpen,
    isGeneratingDraft,
    isLoading,
    isLocked,
    isResetting,
    isRoleOptionsLoading,
    isSavingDraft,
    isSending,
    isStartingConversation,
    isTextStreaming,
    isWaitingForResponse,
    messages,
    nextAdvanceCondition,
    nextQuestion,
    progress,
    questionCount,
    questionStage,
    releaseLock,
    roleOptionsData,
    roleOptionsError,
    roleSelectionSource,
    selectedIndustry,
    selectedRoleName,
    setAnswer,
    setCharLimit,
    setConversationLoadError,
    setCustomRoleInput,
    setError,
    setRoleSelectionSource,
    setSelectedRoleName,
    stageStatus,
    streamingLabel,
    streamingText,
    setupSnapshot,
  } = useMotivationConversationController({ companyId });

  const vm = useMotivationViewModel({
    messages,
    nextQuestion,
    questionCount,
    isDraftReady,
    isTextStreaming,
    isGeneratingDraft,
    isLocked,
    generatedDraft,
    questionStage,
    stageStatus,
    conversationMode,
    currentSlot,
    currentIntent,
    nextAdvanceCondition,
    progress,
    coachingFocus,
    causalGaps,
    evidenceCards,
    evidenceSummary,
    roleOptionsData,
    selectedIndustry,
    selectedRoleName,
    roleSelectionSource,
    customRoleInput,
    setupSnapshot,
    company,
  });

  const {
    showStandaloneQuestion,
    hasSavedConversation,
    requiresIndustrySelection,
    effectiveIndustry,
    isSetupComplete,
    showSetupScreen,
    disableSetupEditing,
    isCustomRoleActive,
    isPostDraftMode,
    motivationModeLabel,
    canGenerateDraft,
    activeStage,
    answerGuide,
    currentIntentLabel,
    currentSlotLabel,
    draftHelperText,
  } = vm;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <ConversationPageSkeleton accent="AIが企業の情報を読み込んでいます" />
        </main>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
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
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6 lg:px-8">
        <MotivationConversationHeader
          companyId={companyId}
          companyName={company.name}
          charLimit={charLimit}
          onCharLimitChange={setCharLimit}
          onGenerateDraft={handleGenerateDraft}
          isGeneratingDraft={isGeneratingDraft}
          canGenerateDraft={canGenerateDraft}
          isLocked={isLocked}
          draftHelperText={draftHelperText}
          showSetupScreen={showSetupScreen}
          isPostDraftMode={isPostDraftMode}
          motivationModeLabel={motivationModeLabel}
        />

        <div className="grid grid-cols-1 gap-4 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)]">
          {/* Chat area */}
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
            <div className="border-b border-border/50 px-3 py-3 sm:px-4 lg:hidden">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {activeStage ? (
                  <span className="text-sm font-medium text-muted-foreground">{STAGE_LABELS[activeStage]}</span>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">{motivationModeLabel}</span>
                )}
                {hasSavedConversation ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetConversation}
                    disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                    className="ml-auto h-10 w-full max-lg:ml-0 max-lg:max-w-none rounded-xl border-border/80 bg-background px-4 text-xs shadow-sm sm:ml-auto sm:w-auto"
                  >
                    <ResetIcon />
                    <span className="ml-2">{isResetting ? "初期化中..." : "会話をやり直す"}</span>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {showSetupScreen ? (
                <MotivationSetupPanel
                  companyName={company.name}
                  effectiveIndustry={effectiveIndustry}
                  requiresIndustrySelection={requiresIndustrySelection}
                  selectedIndustry={selectedIndustry}
                  selectedRoleName={selectedRoleName}
                  customRoleInput={customRoleInput}
                  roleOptionsData={roleOptionsData}
                  roleOptionsError={roleOptionsError}
                  roleSelectionSource={roleSelectionSource}
                  isRoleOptionsLoading={isRoleOptionsLoading}
                  isSetupComplete={isSetupComplete}
                  disableSetupEditing={disableSetupEditing}
                  isCustomRoleActive={isCustomRoleActive}
                  onIndustryChange={(value) => {
                    void handleIndustryChange(value);
                  }}
                  onSelectedRoleNameChange={setSelectedRoleName}
                  onRoleSelectionSourceChange={setRoleSelectionSource}
                  onCustomRoleInputChange={setCustomRoleInput}
                />
              ) : (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      isOptimistic={msg.isOptimistic}
                    />
                  ))}

                  {isTextStreaming && (
                    <StreamingChatMessage streamingText={streamingText} isStreaming={true} />
                  )}

                  {isWaitingForResponse && !isTextStreaming ? (
                    <ThinkingIndicator text={streamingLabel || "次の質問を考え中"} />
                  ) : showStandaloneQuestion ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground">
                          {motivationModeLabel}
                        </div>
                        {coachingFocus && (
                          <div className="inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground">
                            今回の狙い: <span className="ml-1 font-medium text-foreground/80">{coachingFocus}</span>
                          </div>
                        )}
                      </div>
                      {(currentSlotLabel || nextAdvanceCondition || currentIntentLabel) ? (
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs leading-6 text-muted-foreground">
                          {currentSlotLabel ? <p>今確認していること: <span className="font-medium text-foreground/80">{currentSlotLabel}</span></p> : null}
                          {currentIntentLabel ? <p>今回知りたいこと: <span className="font-medium text-foreground/80">{currentIntentLabel}</span></p> : null}
                          {nextAdvanceCondition ? <p>次に進む条件: <span className="font-medium text-foreground/80">{nextAdvanceCondition}</span></p> : null}
                          <p>回答の目安: <span className="font-medium text-foreground/80">{answerGuide}</span></p>
                        </div>
                      ) : null}
                      {nextQuestion && <ChatMessage role="assistant" content={nextQuestion} />}
                      {(evidenceCards.length > 0 || evidenceSummary) && (
                        <div className="lg:hidden">
                          <MotivationEvidenceSection
                            evidenceCards={evidenceCards}
                            evidenceSummary={evidenceSummary}
                            compact
                            showHeader
                          />
                        </div>
                      )}
                    </div>
                  ) : null}

                  {!isWaitingForResponse && !isTextStreaming && !showStandaloneQuestion && (evidenceCards.length > 0 || evidenceSummary) && (
                    <div className="lg:hidden">
                      <MotivationEvidenceSection
                        evidenceCards={evidenceCards}
                        evidenceSummary={evidenceSummary}
                        compact
                        showHeader
                      />
                    </div>
                  )}

                  {isDraftReady && !nextQuestion && !generatedDraft && !isGeneratingDraft && !isWaitingForResponse && !isTextStreaming && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                      材料が揃いました。右上の「志望動機ESを作成」で生成できます。会話を続けて材料を追加することもできます。
                    </div>
                  )}

                  {isDraftReady && !nextQuestion && generatedDraft && !isWaitingForResponse && !isTextStreaming && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                      <p className="text-sm text-sky-900">
                        ESを生成しました。さらに深掘りして強化できます。
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-sky-300 text-sky-700 hover:bg-sky-100"
                        onClick={handleResumeDeepDive}
                        disabled={isSending || isLocked}
                      >
                        深掘りを続ける
                      </Button>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {conversationLoadError && (
              <div className="shrink-0 mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <span>{conversationLoadError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-amber-900 hover:text-amber-900"
                  onClick={() => {
                    setConversationLoadError(null);
                    releaseLock();
                    fetchData();
                  }}
                >
                  再試行
                </Button>
              </div>
            )}

            {error && (
              <div className="shrink-0 mx-4 mb-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-2">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    setError(null);
                    if (generatedDraft && !nextQuestion) {
                      handleResumeDeepDive();
                    } else {
                      releaseLock();
                      fetchData();
                    }
                  }}
                >
                  再試行
                </Button>
              </div>
            )}

            {/* Bottom fixed area: input */}
            <div className="shrink-0 space-y-4 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-lg:pb-3 lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              {showSetupScreen ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    設定を確定すると、対話で材料を集めるか、会話なしで下書きだけ先に作れます。
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    会話なしの下書きは、プロフィール・ガクチカ・公開情報に根ざした範囲に留めます。具体性が足りない場合は「質問を始める」で深掘りしてください。
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateDraftDirect}
                      disabled={
                        !isSetupComplete ||
                        isRoleOptionsLoading ||
                        isStartingConversation ||
                        isLocked ||
                        isGeneratingDraft
                      }
                      className="sm:min-w-44"
                    >
                      {isGeneratingDraft && !isStartingConversation ? (
                        <>
                          <LoadingSpinner />
                          <span className="ml-2">生成中...</span>
                        </>
                      ) : (
                        "会話せずに下書きを作成"
                      )}
                    </Button>
                    <Button
                      onClick={handleStartConversation}
                      disabled={
                        !isSetupComplete ||
                        isRoleOptionsLoading ||
                        isStartingConversation ||
                        isLocked ||
                        isGeneratingDraft
                      }
                      className="sm:min-w-40"
                    >
                      {isStartingConversation ? (
                        <>
                          <LoadingSpinner />
                          <span className="ml-2">開始中...</span>
                        </>
                      ) : (
                        "質問を始める"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <ChatInput
                  value={answer}
                  onChange={setAnswer}
                  onSend={() => handleSend()}
                  disabled={isSending || !nextQuestion || isLocked || showSetupScreen}
                  placeholder={
                    isDraftReady && !nextQuestion && generatedDraft
                      ? "「深掘りを続ける」で補強できます"
                      : answerGuide
                  }
                  className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
                />
              )}
            </div>
          </div>

          <MotivationConversationSidebar
            companyId={companyId}
            effectiveIndustry={effectiveIndustry}
            selectedRoleName={selectedRoleName}
            generatedDraft={generatedDraft}
            generatedDocumentId={generatedDocumentId}
            showSetupScreen={showSetupScreen}
            stageStatus={stageStatus}
            questionCount={questionCount}
            conversationMode={conversationMode}
            coachingFocus={coachingFocus}
            currentSlotLabel={currentSlotLabel}
            currentIntentLabel={currentIntentLabel}
            nextAdvanceCondition={nextAdvanceCondition}
            isDraftReady={isDraftReady}
            nextQuestion={nextQuestion}
            causalGaps={causalGaps}
            evidenceCards={evidenceCards}
            evidenceSummary={evidenceSummary}
            hasSavedConversation={hasSavedConversation}
            isLocked={isLocked}
            isSending={isSending}
            isGeneratingDraft={isGeneratingDraft}
            isResetting={isResetting}
            isStartingConversation={isStartingConversation}
            onResetConversation={handleResetConversation}
            onOpenDraftModal={() => setIsDraftModalOpen(true)}
          />
        </div>

        {generatedDraft ? (
          <MotivationDraftModal
            isOpen={isDraftModalOpen}
            draft={generatedDraft}
            charLimit={charLimit}
            isSaving={isSavingDraft}
            onSave={async () => {
              const docId = await handleSaveGeneratedDraft();
              if (docId) {
                handleCloseDraftModal();
                router.push(`/es/${docId}`);
              }
            }}
            onDeepDive={handleCloseDraftModal}
          />
        ) : null}
      </main>
    </div>
  );
}
