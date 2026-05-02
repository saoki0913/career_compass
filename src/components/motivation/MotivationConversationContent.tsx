"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import { CharLimitSelector } from "@/components/chat/CharLimitSelector";
import { GeneratedDraftActionCard } from "@/components/chat/GeneratedDraftActionCard";
import { DraftPreviewModal } from "@/components/chat/DraftPreviewModal";
import { ConversationWorkspaceShell } from "@/components/chat/ConversationWorkspaceShell";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import { MotivationConversationSidebar } from "@/components/motivation/MotivationConversationSidebar";
import { MotivationSetupPanel } from "@/components/motivation/MotivationSetupPanel";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";
import { useMotivationConversationController } from "@/features/motivation/hooks/useMotivationConversationController";
import { useMotivationViewModel } from "@/features/motivation/hooks/useMotivationViewModel";
import { STAGE_LABELS } from "@/features/motivation/domain/ui";

import { LoadingSpinner, ResetIcon } from "./motivation-icons";

export function MotivationConversationContent({ companyId }: { companyId: string }) {
  const router = useRouter();
  const {
    answer,
    causalGaps,
    charLimit,
    coachingFocus,
    company,
    conversationMode,
    currentIntent,
    currentSlot,
    customRoleInput,
    evidenceCards,
    evidenceSummary,
    userEvidenceCards,
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
    roleOptionsData,
    roleSelectionSource,
    selectedIndustry,
    selectedRoleName,
    setAnswer,
    setCharLimit,
    setCustomRoleInput,
    setRoleSelectionSource,
    setSelectedRoleName,
    slotSummaries,
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
    <>
      <ConversationWorkspaceShell
        backHref={`/companies/${companyId}`}
        title="志望動機を作成"
        subtitle={company.name}
        titleExtra={
          !showSetupScreen ? (
            <Badge variant={isPostDraftMode ? "soft-info" : "outline"} className="px-3 py-1 text-[11px]">
              {motivationModeLabel}
            </Badge>
          ) : null
        }
        actionBar={
          generatedDraft ? (
            <GeneratedDraftActionCard
              draft={generatedDraft}
              charLimit={charLimit}
              documentId={generatedDocumentId}
              onOpenPreview={() => setIsDraftModalOpen(true)}
              isBusy={isGeneratingDraft || isLocked}
            />
          ) : (
            <ConversationActionBar
              actionLabel="志望動機ESを作成"
              pendingLabel="作成中..."
              onAction={handleGenerateDraft}
              disabled={!canGenerateDraft || isLocked}
              isPending={isGeneratingDraft}
              controls={
                <CharLimitSelector
                  value={charLimit}
                  onChange={setCharLimit}
                  disabled={isGeneratingDraft}
                />
              }
            />
          )
        }
        mobileStatus={
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
        }
        conversation={
          showSetupScreen ? (
            <MotivationSetupPanel
              companyName={company.name}
              effectiveIndustry={effectiveIndustry}
              requiresIndustrySelection={requiresIndustrySelection}
              selectedIndustry={selectedIndustry}
              selectedRoleName={selectedRoleName}
              customRoleInput={customRoleInput}
              roleOptionsData={roleOptionsData}
              roleSelectionSource={roleSelectionSource}
              isRoleOptionsLoading={isRoleOptionsLoading}
              isSetupComplete={isSetupComplete}
              disableSetupEditing={disableSetupEditing || isGeneratingDraft || isLocked}
              isCustomRoleActive={isCustomRoleActive}
              onIndustryChange={(value) => {
                void handleIndustryChange(value);
              }}
              onSelectedRoleNameChange={setSelectedRoleName}
              onRoleSelectionSourceChange={setRoleSelectionSource}
              onCustomRoleInputChange={setCustomRoleInput}
            />
          ) : (
            <div className="space-y-4">
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
                    <div className="xl:hidden">
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
                <div className="xl:hidden">
                  <MotivationEvidenceSection
                    evidenceCards={evidenceCards}
                    evidenceSummary={evidenceSummary}
                    compact
                    showHeader
                  />
                </div>
              )}

              {isDraftReady && !nextQuestion && !generatedDraft && !isGeneratingDraft && !isWaitingForResponse && !isTextStreaming && (
                <div className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center">
                  <p className="min-w-0 flex-1">
                    材料が揃いました。右上の「志望動機ESを作成」から任意のタイミングで生成できます。追加で深掘りして強化することもできます。
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                    onClick={handleResumeDeepDive}
                    disabled={isSending || isLocked || isGeneratingDraft}
                  >
                    深掘りを続ける
                  </Button>
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
                    disabled={isSending || isLocked || isGeneratingDraft}
                  >
                    深掘りを続ける
                  </Button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )
        }
        composer={
          <>
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
                    : isDraftReady && !nextQuestion
                      ? "ESは任意のタイミングで作成できます"
                    : answerGuide
                }
                className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
              />
            )}
          </>
        }
        sidebar={
          <MotivationConversationSidebar
            effectiveIndustry={effectiveIndustry}
            selectedRoleName={selectedRoleName}
            generatedDraft={generatedDraft}
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
            userEvidenceCards={userEvidenceCards}
            slotSummaries={slotSummaries}
            hasSavedConversation={hasSavedConversation}
            isLocked={isLocked}
            isSending={isSending}
            isGeneratingDraft={isGeneratingDraft}
            isResetting={isResetting}
            isStartingConversation={isStartingConversation}
            draftHelperText={draftHelperText}
            onResetConversation={handleResetConversation}
          />
        }
      />

      {generatedDraft ? (
        <DraftPreviewModal
          isOpen={isDraftModalOpen}
          title="生成した志望動機ES"
          description="内容を確認して保存するか、深掘りして改善できます。"
          draft={generatedDraft}
          charLimit={charLimit}
          isSaving={isSavingDraft}
          primaryLabel="ESエディタを開く"
          onPrimary={() => {
            if (generatedDocumentId) {
              handleCloseDraftModal();
              router.push(`/es/${generatedDocumentId}`);
              return;
            }
            void (async () => {
              const docId = await handleSaveGeneratedDraft();
              if (docId) {
                handleCloseDraftModal();
                router.push(`/es/${docId}`);
              }
            })();
          }}
          onDeepDive={async () => {
            handleCloseDraftModal();
            await handleResumeDeepDive();
          }}
          onClose={handleCloseDraftModal}
        />
      ) : null}
    </>
  );
}
