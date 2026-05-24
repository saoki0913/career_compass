"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProgressStage } from "@/components/chat";
import {
  ThinkingIndicator,
  ChatMessage,
  ChatInput,
  ConversationRestartConfirmDialog,
  ConversationMobileStatus,
  ReadyOutputBar,
} from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { GenerationModal } from "@/components/chat/GenerationModal";
import { resolveGenerationStatus } from "@/components/chat/generation-modal-status";
import { EsCharLimitField } from "@/components/chat/EsCharLimitField";
import { DraftResultView } from "@/components/chat/DraftResultView";
import { ConversationWorkspaceShell } from "@/components/chat/ConversationWorkspaceShell";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import { MotivationConversationSidebar } from "@/components/motivation/MotivationConversationSidebar";
import { MotivationSetupPanel } from "@/components/motivation/MotivationSetupPanel";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";
import { useMotivationConversationController } from "@/features/motivation/hooks/useMotivationConversationController";
import { useMotivationViewModel } from "@/features/motivation/hooks/useMotivationViewModel";
import {
  getMotivationSlotPillStatus,
  SLOT_PILL_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  type MotivationStageKey,
} from "@/features/motivation/domain/ui";

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
    confirmResetConversation,
    requestResetConversation,
    restartDialogOpen,
    setRestartDialogOpen,
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
    industryState,
    effectiveIndustry,
    isSetupComplete,
    showSetupScreen,
    disableSetupEditing,
    isCustomRoleActive,
    motivationModeLabel,
    canGenerateDraft,
    activeStage,
    answerGuide,
    currentIntentLabel,
    currentSlotLabel,
    draftHelperText,
  } = vm;

  const isDeepDive = conversationMode === "deepdive";
  type SlotKey = Exclude<MotivationStageKey, "closing">;
  const mobileProgressStages = useMemo<ProgressStage[]>(() => {
    // deepdive 中は材料収集が完了済みのため、causalGaps の有無に関わらず slot pill を全 done で維持する
    // (右パネルの MotivationConversationSidebar と挙動を統一し、再生成で進捗が消えないようにする)。
    if (isDeepDive) {
      return (STAGE_ORDER as SlotKey[]).map((slot) => ({
        key: slot,
        label: SLOT_PILL_LABELS[slot],
        status: "done" as const,
      }));
    }
    return (STAGE_ORDER as SlotKey[]).map((slot) => ({
      key: slot,
      label: SLOT_PILL_LABELS[slot],
      status: getMotivationSlotPillStatus(slot, stageStatus),
    }));
  }, [isDeepDive, stageStatus]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const readyOutputActions = [
    {
      key: "draft",
      label: "ES作成",
      icon: "draft" as const,
      pending: isGeneratingDraft,
      onClick: () => setIsDraftModalOpen(true),
    },
  ];
  const draftStatus = resolveGenerationStatus({
    hasResult: Boolean(generatedDraft),
    canGenerate: canGenerateDraft,
    isGenerating: isGeneratingDraft,
  });

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
        actionBar={
          <ReadyOutputBar actions={readyOutputActions} compact />
        }
        mobileStatus={
          <ConversationMobileStatus
            badges={
              activeStage ? (
                <span className="text-sm font-medium text-muted-foreground">{STAGE_LABELS[activeStage]}</span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">{motivationModeLabel}</span>
              )
            }
            stages={mobileProgressStages}
            headerSubtext={`${questionCount > 0 ? `${questionCount}問目` : "これから1問目"}`}
            footerMessage={coachingFocus}
            columns={STAGE_ORDER.length}
            actions={
              hasSavedConversation ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestResetConversation}
                  disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                  className="ml-auto h-10 w-full max-lg:ml-0 max-lg:max-w-none rounded-xl border-border/80 bg-background px-4 text-xs shadow-sm sm:ml-auto sm:w-auto"
                >
                  <ResetIcon />
                  <span className="ml-2">{isResetting ? "初期化中..." : "会話をやり直す"}</span>
                </Button>
              ) : undefined
            }
          />
        }
        conversation={
          showSetupScreen ? (
            <MotivationSetupPanel
              companyName={company.name}
              effectiveIndustry={effectiveIndustry}
              industryState={industryState}
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
              <div className="space-y-3">
                <ChatInput
                value={answer}
                onChange={setAnswer}
                onSend={() => handleSend()}
                disabled={isSending || isLocked || showSetupScreen}
                placeholder={
                  isDraftReady ? "追加で深掘りしたい内容を入力してください" : answerGuide
                }
                className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
              />
              </div>
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
            onResetConversation={requestResetConversation}
          />
        }
      />

      <ConversationRestartConfirmDialog
        isOpen={restartDialogOpen}
        title="会話をやり直しますか？"
        description="保存済みの志望動機会話を初期化して、新しい会話を始めます。"
        confirmLabel="やり直す"
        onCancel={() => setRestartDialogOpen(false)}
        onConfirm={confirmResetConversation}
        isConfirming={isResetting}
      />

      <GenerationModal
        open={isDraftModalOpen}
        onOpenChange={(next) => {
          if (!next) handleCloseDraftModal();
        }}
        status={draftStatus}
        icon="draft"
        title="ES作成"
        description="志望動機の深掘り内容からESを生成します。"
        lockedReason="深掘りで材料が揃うと、ESを生成できます。質問に答えて志望動機の要素を具体化してください。"
        requirements={[{ label: "業界理由・企業理由・差別化などの整理", met: canGenerateDraft }]}
        settingsSlot={
          <EsCharLimitField
            value={charLimit}
            onValueChange={setCharLimit}
            materialItems={[
              { title: "深掘り会話", description: "この会話で確認した内容" },
              { title: "業界理由・企業理由・差別化", description: "志望動機の主要な構成要素" },
              { title: "入社後にやりたいこと", description: "将来像と貢献内容" },
            ]}
          />
        }
        resultSlot={
          generatedDraft ? <DraftResultView draft={generatedDraft} charLimit={charLimit} /> : null
        }
        generateAction={{ label: "ESを生成", onGenerate: () => void handleGenerateDraft() }}
        primaryAction={{
          label: "ESエディタを開く",
          loading: isSavingDraft,
          onClick: () => {
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
          },
        }}
        secondaryAction={{
          label: "もっと深掘りして再生成する",
          onClick: async () => {
            handleCloseDraftModal();
            await handleResumeDeepDive();
          },
        }}
      />
    </>
  );
}
