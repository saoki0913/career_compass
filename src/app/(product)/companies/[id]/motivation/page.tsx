"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ThinkingIndicator, ChatMessage, ChatInput } from "@/components/chat";
import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { ConversationPageSkeleton } from "@/components/skeletons/ConversationPageSkeleton";
import { useMotivationConversationController } from "@/hooks/useMotivationConversationController";
import {
  CONVERSATION_MODE_LABELS,
  type EvidenceCard,
  findRoleOption,
  INTENT_LABELS,
  type MotivationStageKey,
  STAGE_ANSWER_GUIDE,
  STAGE_LABELS,
  STAGE_ORDER,
  type StageStatus,
} from "@/lib/motivation/ui";

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

function normalizeTrackerStage(stage: MotivationStageKey): Exclude<MotivationStageKey, "closing"> {
  return stage === "closing" ? "differentiation" : stage;
}

function MotivationStageTracker({ stageStatus }: { stageStatus: StageStatus | null }) {
  if (!stageStatus) return null;

  const currentForUi = normalizeTrackerStage(stageStatus.current);

  return (
    <div className="space-y-2">
      {STAGE_ORDER.map((stage) => {
        const isCurrent = currentForUi === stage;
        const isCompleted =
          stageStatus.completed.includes(stage) ||
          (stage === "differentiation" && stageStatus.completed.includes("closing"));
        return (
          <div
            key={stage}
            className={cn(
              "rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm",
              isCurrent && "border-sky-300 bg-sky-50 text-slate-900",
              isCompleted && "border-emerald-200 bg-emerald-50 text-emerald-800",
              !isCurrent && !isCompleted && "border-border/60 bg-muted/20 text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{STAGE_LABELS[stage]}</span>
              <span>
                {isCompleted ? "完了" : isCurrent ? "進行中" : "未着手"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MotivationDraftActionBar({
  charLimit,
  onCharLimitChange,
  onGenerate,
  isGenerating,
  disabled,
  helperText,
  compact = false,
  layout = "stack",
  showTitle = true,
}: {
  charLimit: 300 | 400 | 500;
  onCharLimitChange: (limit: 300 | 400 | 500) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled: boolean;
  helperText: string;
  compact?: boolean;
  layout?: "stack" | "inline";
  showTitle?: boolean;
}) {
  const isInline = layout === "inline";
  const controls = (
    <>
      <p className="text-xs font-medium text-muted-foreground xl:shrink-0">文字数</p>
      <div className="grid grid-cols-3 gap-2">
        {([300, 400, 500] as const).map((limit) => (
          <button
            key={limit}
            type="button"
            onClick={() => onCharLimitChange(limit)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
              charLimit === limit
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-secondary"
            )}
          >
            {limit}字
          </button>
        ))}
      </div>
    </>
  );

  if (isInline) {
    return (
      <ConversationActionBar
        helperText={helperText}
        actionLabel="志望動機ESを作成"
        pendingLabel="作成中..."
        onAction={onGenerate}
        disabled={disabled}
        isPending={isGenerating}
        controls={controls}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "gap-2",
          compact ? "flex flex-col" : "flex items-start justify-between"
        )}
      >
        <div className="min-w-0">
          {showTitle ? <p className="text-sm font-semibold text-foreground">志望動機ESを作成</p> : null}
          <p className={cn("text-xs leading-5 text-muted-foreground", !showTitle && "text-sm leading-5")}>
            {helperText}
          </p>
        </div>

        <>
          <div className="flex flex-col gap-2 md:flex-row md:items-center xl:justify-self-end">{controls}</div>
          <Button
            onClick={onGenerate}
            disabled={disabled || isGenerating}
            className={cn("rounded-2xl shadow-sm", compact ? "h-11 w-full" : "h-11 min-w-[180px]")}
          >
            {isGenerating ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">作成中...</span>
              </>
            ) : (
              "志望動機ESを作成"
            )}
          </Button>
        </>
      </div>
    </div>
  );
}

function MotivationConversationContent() {
  const params = useParams();
  const companyId = params.id as string;
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
    handleGenerateDraft,
    handleGenerateDraftDirect,
    handleIndustryChange,
    handleResetConversation,
    handleSaveGeneratedDraft,
    handleSend,
    handleStartConversation,
    isDraftReady,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, nextQuestion]);

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 overflow-hidden">
          <ConversationPageSkeleton accent="AIが企業の情報を読み込んでいます" />
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

  const showStandaloneQuestion =
    !isTextStreaming &&
    !!nextQuestion &&
    !(messages.length > 0 &&
      messages[messages.length - 1].role === "assistant" &&
      messages[messages.length - 1].content === nextQuestion);
  const hasSavedConversation =
    setupSnapshot?.hasSavedConversation ||
    questionCount > 0 ||
    messages.length > 0 ||
    isDraftReady;
  const hasStartedConversation = messages.length > 0;
  const requiresIndustrySelection = Boolean(roleOptionsData?.requiresIndustrySelection);
  const effectiveIndustry =
    selectedIndustry ||
    roleOptionsData?.industry ||
    setupSnapshot?.resolvedIndustry ||
    company.industry ||
    "";
  const isSetupComplete = Boolean(selectedRoleName.trim()) && (!requiresIndustrySelection || Boolean(effectiveIndustry));
  const showSetupScreen = !hasStartedConversation;
  const disableSetupEditing = hasStartedConversation;
  const isCustomRoleActive = roleSelectionSource === "custom" && customRoleInput.trim().length > 0;
  const isPostDraftMode = Boolean(generatedDraft?.trim()) && isDraftReady;
  const motivationModeLabel = CONVERSATION_MODE_LABELS[conversationMode];
  const canGenerateDraft =
    isDraftReady &&
    messages.length >= 2 &&
    !showSetupScreen;
  const activeStage = currentSlot || (questionStage !== "closing" ? questionStage : null);
  const answerGuide = activeStage ? STAGE_ANSWER_GUIDE[activeStage] : "1〜2文で答えてください。";
  const currentIntentLabel = currentIntent ? (INTENT_LABELS[currentIntent] || currentIntent) : null;
  const currentSlotLabel =
    questionStage === "closing"
      ? CONVERSATION_MODE_LABELS[conversationMode]
      : progress?.current_slot_label || (activeStage ? STAGE_LABELS[activeStage] : null);
  const progressCompleted = progress?.completed ?? 0;
  const progressTotal = progress?.total ?? 6;

  const draftHelperText = (() => {
    if (isGeneratingDraft) return "会話内容をもとに志望動機ESを生成しています。";
    if (showSetupScreen) return "質問開始後に、会話内容をもとに志望動機ESを作成できます。";
    if (isPostDraftMode) return "ES作成後の補足深掘りです。必要な材料だけを追加で整理できます。";
    if (!isDraftReady) return "十分な材料が揃うと作成できます。会話は途中でも続けられます。";
    if (isLocked) return "進行中の処理が終わると、志望動機ESを作成できます。";
    return "会話内容から志望動機ESを生成できます。必要なら生成後に追加で深掘りできます。";
  })();

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <DashboardHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/companies/${companyId}`}
              className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="戻る"
            >
              <ArrowLeftIcon />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-bold">志望動機を作成</h1>
                <div className="hidden h-1.5 w-1.5 rounded-full bg-muted-foreground/30 lg:block" />
                <p className="text-sm text-muted-foreground">{company.name}</p>
                {!showSetupScreen ? (
                  <Badge variant={isPostDraftMode ? "soft-info" : "outline"} className="px-3 py-1 text-[11px]">
                    {motivationModeLabel}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="w-full xl:max-w-[760px]">
            <MotivationDraftActionBar
              charLimit={charLimit}
              onCharLimitChange={setCharLimit}
              onGenerate={handleGenerateDraft}
              isGenerating={isGeneratingDraft}
              disabled={!canGenerateDraft || isLocked}
              helperText={draftHelperText}
              layout="inline"
              showTitle={false}
            />
          </div>
        </div>

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

            {/* Messages: setup fits viewport (inner scroll); conversation scrolls here */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {showSetupScreen ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
                  <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-border/70 bg-background/95 shadow-sm">
                      <div className="shrink-0 border-b border-border/50 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">最初に業界と職種を確定します</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              企業情報、ガクチカ、プロフィール、志望職種を踏まえた質問にするため、チャット前に前提を揃えます。
                            </p>
                          </div>
                          {isSetupComplete ? (
                            <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                              準備完了
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 sm:pt-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">企業</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            この企業向けの志望動機を作成します。
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{company.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {effectiveIndustry ? `業界: ${effectiveIndustry}` : "業界は次で指定します"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">業界</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {requiresIndustrySelection
                              ? "企業情報だけでは広いため、ここで必須選択します。"
                              : "企業情報から解決できているため確認のみです。"}
                          </p>
                        </div>

                        {requiresIndustrySelection ? (
                          <Select
                            value={selectedIndustry}
                            disabled={disableSetupEditing}
                            onValueChange={(value) => {
                              void handleIndustryChange(value);
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-2xl">
                              <SelectValue placeholder="業界を選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                              {(roleOptionsData?.industryOptions || []).map((industry) => (
                                <SelectItem key={industry} value={industry}>
                                  {industry}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                            <p className="text-sm font-medium text-foreground">{effectiveIndustry || "業界未取得"}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-border/60 bg-background/85 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">志望職種</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            候補から選び、見つからない場合だけ自由入力を使ってください。
                          </p>
                        </div>
                        {isRoleOptionsLoading ? (
                          <span className="text-xs text-muted-foreground">候補を読み込み中...</span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                        <div>
                          <Select
                            disabled={disableSetupEditing || !effectiveIndustry || (roleOptionsData?.roleGroups.length ?? 0) === 0}
                            value={roleSelectionSource === "custom" ? "" : selectedRoleName}
                            onValueChange={(value) => {
                              const matched = roleOptionsData ? findRoleOption(roleOptionsData.roleGroups, value) : null;
                              setSelectedRoleName(value);
                              setRoleSelectionSource(matched?.source || null);
                              setCustomRoleInput("");
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-2xl">
                              <SelectValue placeholder={effectiveIndustry ? "職種を選択してください" : "先に業界を選択してください"} />
                            </SelectTrigger>
                            <SelectContent>
                              {(roleOptionsData?.roleGroups || []).map((group) => (
                                <SelectGroup key={group.id}>
                                  <SelectLabel className="text-xs font-normal text-muted-foreground">
                                    {group.label}
                                  </SelectLabel>
                                  {group.options.map((option) => (
                                    <SelectItem key={`${group.id}-${option.value}`} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            候補にない場合のみ入力
                          </label>
                          <Input
                            className="mt-2"
                            disabled={disableSetupEditing || !effectiveIndustry}
                            placeholder="例: デジタル企画、プロダクトマネージャー"
                            value={customRoleInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setCustomRoleInput(nextValue);
                              setSelectedRoleName(nextValue);
                              setRoleSelectionSource(nextValue.trim() ? "custom" : null);
                            }}
                          />
                          {isCustomRoleActive ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              現在は自由入力の職種を優先して質問を組み立てます。
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {roleOptionsError ? (
                        <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-muted-foreground">
                          {roleOptionsError}
                        </div>
                      ) : null}

                      {!roleOptionsError && effectiveIndustry && (roleOptionsData?.roleGroups.length ?? 0) === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          候補がないため、右側の自由入力で職種を指定してください。
                        </p>
                      ) : null}

                      {(effectiveIndustry || selectedRoleName) && (
                        <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            現在の設定
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {effectiveIndustry ? (
                              <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                                業界: {effectiveIndustry}
                              </Badge>
                            ) : null}
                            {selectedRoleName ? (
                              <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                                職種: {selectedRoleName}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                      <ChatMessage role="assistant" content={nextQuestion} />
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
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Error message */}
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
                  onClick={() => { setError(null); releaseLock(); fetchData(); }}
                >
                  再試行
                </Button>
              </div>
            )}

            {/* Bottom fixed area: input */}
            <div className="shrink-0 space-y-4 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-lg:pb-[calc(0.75rem+var(--mobile-bottom-nav-offset))] lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
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
                  placeholder={answerGuide}
                  className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0"
                />
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              <Card className="border-border/50">
                <CardHeader className="flex min-h-12 flex-row items-center justify-between space-y-0 px-3.5 py-2.5">
                  <CardTitle className="text-sm font-medium">進捗</CardTitle>
                  {hasSavedConversation ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetConversation}
                      disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                      className="h-9 rounded-xl border-border/80 bg-background px-3 text-xs shadow-sm"
                    >
                      <ResetIcon />
                      <span className="ml-2">{isResetting ? "初期化中..." : "会話をやり直す"}</span>
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="px-3.5 pb-3.5 pt-0">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {effectiveIndustry ? (
                      <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                        業界: {effectiveIndustry}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="px-3 py-1 text-[11px]">
                        業界未確定
                      </Badge>
                    )}
                    {selectedRoleName ? (
                      <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                        職種: {selectedRoleName}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="px-3 py-1 text-[11px]">
                        職種未選択
                      </Badge>
                    )}
                  </div>

                  {showSetupScreen ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">開始前の設定</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        業界と職種を確定すると、この企業向けに質問が始まります。
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge variant={isPostDraftMode ? "soft-info" : "outline"} className="px-3 py-1 text-[11px]">
                          {motivationModeLabel}
                        </Badge>
                        {generatedDraft ? (
                          <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                            ES下書き生成済み
                          </Badge>
                        ) : null}
                      </div>
                      <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                          進捗: <span className="font-medium text-foreground/80">{progressCompleted}項目 / {progressTotal}項目</span>
                        </p>
                        {currentSlotLabel ? (
                          <p className="text-xs text-muted-foreground">
                            今確認していること: <span className="font-medium text-foreground/80">{currentSlotLabel}</span>
                          </p>
                        ) : null}
                        {currentIntentLabel ? (
                          <p className="text-xs text-muted-foreground">
                            今回知りたいこと: <span className="font-medium text-foreground/80">{currentIntentLabel}</span>
                          </p>
                        ) : null}
                        {nextAdvanceCondition ? (
                          <p className="text-xs text-muted-foreground">
                            次に進む条件: <span className="font-medium text-foreground/80">{nextAdvanceCondition}</span>
                          </p>
                        ) : null}
                      </div>
                      {activeStage && (
                        <p className="mb-2 pt-2 text-xs text-center text-muted-foreground">{STAGE_LABELS[activeStage]}</p>
                      )}
                      {coachingFocus && (
                        <p className="mb-2 text-xs text-center text-muted-foreground">
                          今回の狙い: <span className="font-medium text-foreground/80">{coachingFocus}</span>
                        </p>
                      )}
                      <div className="mt-3">
                        <MotivationStageTracker stageStatus={stageStatus} />
                      </div>
                      {conversationMode === "deepdive" && causalGaps.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-border/60 bg-background px-4 py-3">
                          <p className="text-xs font-medium text-foreground">補強対象</p>
                          <div className="mt-2 space-y-2">
                            {causalGaps.slice(0, 2).map((gap) => (
                              <p key={gap.id} className="text-xs leading-5 text-muted-foreground">
                                {gap.reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="px-3.5 py-2.5">
                  <CardTitle className="text-sm font-medium">参考にした企業情報</CardTitle>
                </CardHeader>
                <CardContent className="px-3.5 pb-3.5 pt-0">
                  {evidenceCards.length > 0 || evidenceSummary ? (
                    <MotivationEvidenceSection
                      evidenceCards={evidenceCards}
                      evidenceSummary={evidenceSummary}
                      compact
                      showHeader={false}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      質問に使った企業情報の要点が、ここに簡潔に表示されます。
                    </p>
                  )}
                </CardContent>
              </Card>

              {generatedDraft ? (
                <Card className="border-border/50">
                  <CardHeader className="px-3.5 py-2.5">
                    <CardTitle className="text-sm font-medium">生成した下書き</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3.5 pb-3.5 pt-0">
                    <p className="text-xs leading-5 text-muted-foreground">
                      {generatedDocumentId
                        ? "志望動機 ES の下書きは保存済みです。必要ならこのまま補足質問に答えて、企業理由や原体験を強められます。"
                        : "生成直後の下書きはまだ ES 一覧に保存していません。内容を残したい場合は先に保存してください。"}
                    </p>
                    {!generatedDocumentId ? (
                      <Button
                        className="w-full"
                        onClick={handleSaveGeneratedDraft}
                        disabled={isSavingDraft || isGeneratingDraft}
                      >
                        {isSavingDraft ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">保存中...</span>
                          </>
                        ) : (
                          "ESとして保存する"
                        )}
                      </Button>
                    ) : null}
                    {generatedDocumentId ? (
                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/es/${generatedDocumentId}`}>ESを編集する</Link>
                      </Button>
                    ) : null}
                    <Button asChild className="w-full">
                      <Link href={`/companies/${companyId}/interview`}>この志望動機をもとに面接対策へ進む</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MotivationConversationPage() {
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
          <LoginRequiredForAi title="志望動機のAI支援はログイン後にご利用いただけます" />
        </main>
      </div>
    );
  }

  return (
    <OperationLockProvider>
      <NavigationGuard />
      <MotivationConversationContent />
    </OperationLockProvider>
  );
}
