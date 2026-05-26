"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { ConversationWorkspaceShell } from "@/components/chat/ConversationWorkspaceShell";
import { ChatInput, ChatMessage, ConversationMobileStatus, ReadyOutputBar, ThinkingIndicator } from "@/components/chat";
import { StreamingChatMessage } from "@/components/chat/StreamingChatMessage";
import { GenerationModal } from "@/components/chat/GenerationModal";
import { resolveGenerationStatus } from "@/components/chat/generation-modal-status";
import { DrillPanel } from "@/components/interview/DrillPanel";
import {
  FeedbackHistoryList,
  InterviewConversationSidebar,
  InterviewMaterialsCard,
  ResetConfirmButton,
  resolveInterviewScoreAxis,
} from "@/components/interview/InterviewConversationSidebar";
import { RoleSelector } from "@/components/interview/RoleSelector";
import { SheetViewer } from "@/components/interview/SheetViewer";
import { SheetViewerDialog } from "@/components/interview/SheetViewerDialog";
import { InterviewFeedbackStreamingView } from "@/components/interview/InterviewFeedbackStreamingView";
import { InterviewConversationSkeleton } from "@/components/skeletons/InterviewConversationSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInterviewConversationController } from "@/hooks/useInterviewConversationController";
import { useInterviewViewModel } from "@/hooks/interview/useInterviewViewModel";
import {
  INTERVIEW_FORMAT_OPTIONS,
  INTERVIEW_STAGE_OPTIONS,
  INTERVIEWER_TYPE_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
  type InterviewFormat,
  type InterviewRoundStage,
  type InterviewSelectionType,
  type InterviewStrictnessMode,
  type InterviewerType,
} from "@/lib/interview/session";
import { notifySuccess } from "@/lib/notifications";
import type { InterviewSheetData } from "@/lib/interview/sheet-builder";
import {
  INDUSTRY_SELECT_UNSET,
  INTERVIEWER_TYPE_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_STAGE_LABELS,
  ROLE_SELECT_UNSET,
  ROLE_TRACK_LABELS,
  SELECTION_TYPE_LABELS,
  STRICTNESS_MODE_LABELS,
} from "@/lib/interview/ui";

function parseSheetData(raw: unknown): InterviewSheetData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.companyName !== "string" || !Array.isArray(obj.scores)) return null;
  return raw as InterviewSheetData;
}

export function InterviewPageContent({ companyId }: { companyId: string | string[] | undefined }) {
  const { normalizedCompanyId } = useInterviewViewModel({
    companyId,
    feedback: null,
    stageStatus: null,
    questionCount: 0,
    questionFlowCompleted: false,
    hasStarted: false,
  });
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const lastAnnouncedFeedbackCompletionCountRef = useRef(0);

  const { state, actions } = useInterviewConversationController({ companyId: normalizedCompanyId, enabled: Boolean(normalizedCompanyId) });
  const { companyName, materials, messages, answer, feedback, streamingFeedback, feedbackHistories, selectedHistory, questionCount, transitionLine, stageStatus, turnMeta, streamingLabel, streamingText, isTextStreaming, isLoading, isGeneratingFeedback, isSavingSatisfaction, questionFlowCompleted, legacySessionDetected, setupState, roleOptionsData, selectedRoleName, customRoleName, roleSelectionSource, effectiveIndustry, resolvedSelectedRole, setupComplete, hasStarted, isBusy, isComplete, canSend, canGenerateFeedback, canContinue, latestFeedbackHistory, feedbackHelperText, feedbackCompletionCount, billingCosts, sessionState, nextQuestionHint, availabilityIssue, isInteractionBlocked } = state;

  const { weakestAxis, topicStages, interviewPhases, questionDisplay, coachingNarrative } = useInterviewViewModel({
    companyId,
    feedback,
    stageStatus,
    questionCount,
    questionFlowCompleted,
    hasStarted,
  });
  const feedbackScoreRecord = useMemo(
    () =>
      feedback
        ? Object.fromEntries(
            Object.entries(feedback.scores).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
          )
        : {},
    [feedback],
  );
  const drillAxis = resolveInterviewScoreAxis(weakestAxis);
  const { setAnswer, setSetupState, setSelectedHistory, selectRole, setCustomRoleName, start: handleStart, send: handleSend, generateFeedback: handleGenerateFeedback, continueInterview: handleContinue, reset: handleReset, saveSatisfaction: handleSaveSatisfaction } = actions;

  const [sheetGenerationOpen, setSheetGenerationOpen] = useState(false);

  const activeSheetData = useMemo(() => parseSheetData(latestFeedbackHistory?.sheetDataJson), [latestFeedbackHistory?.sheetDataJson]);
  const activeSheetFallback = latestFeedbackHistory?.sheetContent ?? null;

  const selectedSheetData = useMemo(() => parseSheetData(selectedHistory?.sheetDataJson), [selectedHistory?.sheetDataJson]);
  const selectedSheetFallback = selectedHistory?.sheetContent ?? null;

  const readyOutputActions = [
    {
      key: "sheet",
      label: "まとめシート作成",
      icon: "sheet" as const,
      pending: isGeneratingFeedback,
      pendingLabel: "まとめシート生成状況を見る",
      onClick: () => setSheetGenerationOpen(true),
    },
  ];
  const sheetStatus = resolveGenerationStatus({
    // feedback は startTransition 経由(非緊急)で commit され、isGeneratingFeedback=false は緊急更新。
    // streamingFeedback は完了まで non-null を保つため、これも見て done 状態を維持し ready へのフリッカーを防ぐ。
    hasResult: Boolean(feedback ?? streamingFeedback),
    canGenerate: questionFlowCompleted && canGenerateFeedback,
    isGenerating: isGeneratingFeedback,
  });

  useEffect(() => { const viewport = conversationRef.current?.parentElement; if (!viewport) return; const handleScroll = () => { const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight; autoScrollEnabledRef.current = distanceFromBottom < 96; }; handleScroll(); viewport.addEventListener("scroll", handleScroll); return () => viewport.removeEventListener("scroll", handleScroll); }, [hasStarted]);
  useEffect(() => { if (!autoScrollEnabledRef.current) return; conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, streamingText, streamingFeedback?.overall_comment, streamingFeedback?.improved_answer, streamingFeedback?.strengths.length, streamingFeedback?.improvements.length, streamingFeedback?.next_preparation.length, streamingFeedback?.consistency_risks.length]);
  useEffect(() => { if (!feedback || feedbackCompletionCount <= lastAnnouncedFeedbackCompletionCountRef.current) return; lastAnnouncedFeedbackCompletionCountRef.current = feedbackCompletionCount; requestAnimationFrame(() => { setSheetGenerationOpen(true); }); notifySuccess({ title: "まとめシートを生成しました", description: "まとめシートを表示しました。内容を確認しながら振り返れます。", duration: 4200 }); }, [feedback, feedbackCompletionCount]);

  if (isLoading) { return (<div className="min-h-screen bg-background"><main><InterviewConversationSkeleton accent="面接の準備を進めています" /></main></div>); }
  if (!normalizedCompanyId) { return (<div className="min-h-screen bg-background"><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="border-border/60"><CardHeader><CardTitle className="text-base">企業を特定できません</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">URLが不完全な可能性があります。企業一覧から対象の企業を開き直してください。</p><Button asChild className="w-full sm:w-auto"><Link href="/companies">企業一覧へ</Link></Button></CardContent></Card></main></div>); }
  if (availabilityIssue) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">{availabilityIssue.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">{availabilityIssue.description}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={() => window.location.reload()} className="w-full sm:w-auto">
                  再試行
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={`/companies/${normalizedCompanyId}`}>企業詳細へ戻る</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <>
      <ConversationWorkspaceShell
        backHref={`/companies/${normalizedCompanyId}`}
        title="面接対策"
        subtitle={companyName || "企業特化模擬面接"}
        actionBar={<ReadyOutputBar actions={readyOutputActions} compact />}
        mobileStatus={
          <ConversationMobileStatus
            stages={topicStages}
            headerSubtext={questionDisplay}
            footerMessage={transitionLine || coachingNarrative}
            columns={2}
            detailsLabel="詳細情報"
            detailsBadge={
              feedbackHistories.length > 0 || materials.length > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {materials.length + feedbackHistories.length}件
                </span>
              ) : undefined
            }
            badges={
              <>
                <Badge variant="outline" className="px-2 py-0 text-[11px]">
                  {turnMeta?.interviewSetupNote || stageStatus?.currentTopicLabel || "開始前"}
                </Badge>
                <Badge variant="outline" className="px-2 py-0 text-[11px]">
                  {questionCount > 0 ? `${questionCount}問目` : "開始前"}
                </Badge>
              </>
            }
          >
            {sessionState.isActive ? (
              <div className="rounded-xl border border-border/60 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                前回の続きです。現在 {sessionState.questionCount || questionCount} 問目まで進んでいます。
              </div>
            ) : null}
            <div className="rounded-xl border border-border/60 bg-background px-3 py-2">
              <p className="mb-2 text-xs font-medium text-foreground">参考にする材料</p>
              <InterviewMaterialsCard materials={materials} />
            </div>
            <div className="rounded-xl border border-border/60 bg-background px-3 py-2">
              <p className="mb-2 text-xs font-medium text-foreground">過去のまとめシート</p>
              <FeedbackHistoryList histories={feedbackHistories} onOpen={setSelectedHistory} />
            </div>
          </ConversationMobileStatus>
        }
        conversation={
          !hasStarted ? (
            <div className="space-y-6 px-3 py-2 sm:px-4">
              <Card className="border-border/60">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">面接設定</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    開始前に応募職種、面接方式、選考種別、面接段階、面接官タイプ、厳しさを設定します。
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {setupState.requiresIndustrySelection ? (<div className="space-y-2"><p className="text-sm font-medium">業界</p><Select value={effectiveIndustry || INDUSTRY_SELECT_UNSET} onValueChange={(value) => setSetupState((prev) => ({ ...prev, selectedIndustry: value === INDUSTRY_SELECT_UNSET ? null : value }))}><SelectTrigger className="w-full"><SelectValue placeholder="業界を選択" /></SelectTrigger><SelectContent><SelectItem value={INDUSTRY_SELECT_UNSET}>業界を選択</SelectItem>{setupState.industryOptions.map((industry) => (<SelectItem key={industry} value={industry}>{industry}</SelectItem>))}</SelectContent></Select></div>) : (<div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">業界: {effectiveIndustry || "未設定"}</div>)}
                  <RoleSelector
                    roleGroups={roleOptionsData?.roleGroups ?? []}
                    selectedRoleName={selectedRoleName}
                    customRoleName={customRoleName}
                    roleSelectionSource={roleSelectionSource}
                    onSelectRole={(value) => selectRole(value, ROLE_SELECT_UNSET)}
                    onClearRole={() => selectRole(ROLE_SELECT_UNSET, ROLE_SELECT_UNSET)}
                    onCustomRoleChange={setCustomRoleName}
                    isFallback={roleOptionsData?.isFallback}
                    fallbackReason={roleOptionsData?.fallbackReason}
                    disabled={isInteractionBlocked || isBusy}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><p className="text-sm font-medium">面接方式</p><Select value={setupState.interviewFormat} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewFormat: value as InterviewFormat }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接方式を選択" /></SelectTrigger><SelectContent>{INTERVIEW_FORMAT_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEW_FORMAT_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">選考種別</p><Select value={setupState.selectionType} onValueChange={(value) => setSetupState((prev) => ({ ...prev, selectionType: value as InterviewSelectionType }))}><SelectTrigger className="w-full"><SelectValue placeholder="選考種別を選択" /></SelectTrigger><SelectContent>{SELECTION_TYPE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{SELECTION_TYPE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">面接段階</p><Select value={setupState.interviewStage} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewStage: value as InterviewRoundStage }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接段階を選択" /></SelectTrigger><SelectContent>{INTERVIEW_STAGE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEW_STAGE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">面接官タイプ</p><Select value={setupState.interviewerType} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewerType: value as InterviewerType }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接官タイプを選択" /></SelectTrigger><SelectContent>{INTERVIEWER_TYPE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEWER_TYPE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2 md:col-span-2"><p className="text-sm font-medium">厳しさ</p><Select value={setupState.strictnessMode} onValueChange={(value) => setSetupState((prev) => ({ ...prev, strictnessMode: value as InterviewStrictnessMode }))}><SelectTrigger className="w-full"><SelectValue placeholder="厳しさを選択" /></SelectTrigger><SelectContent>{STRICTNESS_MODE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{STRICTNESS_MODE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                  </div>
                  {(effectiveIndustry || resolvedSelectedRole) && (<div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"><p>業界: {effectiveIndustry || "未設定"}</p><p>職種: {resolvedSelectedRole || "未設定"}</p><p>職種分類: {ROLE_TRACK_LABELS[setupState.roleTrack]}</p><p>面接方式: {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}</p><p>選考種別: {SELECTION_TYPE_LABELS[setupState.selectionType]}</p><p>段階: {INTERVIEW_STAGE_LABELS[setupState.interviewStage]}</p><p>面接官: {INTERVIEWER_TYPE_LABELS[setupState.interviewerType]}</p><p>厳しさ: {STRICTNESS_MODE_LABELS[setupState.strictnessMode]}</p></div>)}
                  <div className="space-y-3">
                    {legacySessionDetected ? (
                      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p>以前の面接セッション形式が古いため、このまま続行できません。</p>
                        <ResetConfirmButton onReset={handleReset} disabled={isBusy} variant="default" />
                      </div>
                    ) : (
                      <>
                        <Button onClick={handleStart} disabled={!setupComplete || isInteractionBlocked || isBusy} className="w-full sm:w-auto">{isBusy ? (<><svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><span className="ml-2">準備中...</span></>) : ("面接対策を始める")}</Button>
                        <p className="text-xs leading-5 text-muted-foreground">開始時に{billingCosts.start} credits、回答送信ごとに{billingCosts.turn} credit、まとめシートは成功時に{billingCosts.feedback} creditsを消費します。</p>
                        {!setupComplete && !isBusy ? (<p className="text-xs text-muted-foreground">職種を入力すると開始できます</p>) : null}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div ref={conversationRef} className="space-y-4">
              {messages.map((message, index) => (<ChatMessage key={`${message.role}-${index}-${message.content.slice(0, 20)}`} role={message.role} content={message.content} />))}
              {isBusy && !isTextStreaming && !streamingText && !streamingFeedback?.overall_comment && !streamingFeedback?.improved_answer ? (<ThinkingIndicator text={streamingLabel || (isGeneratingFeedback ? "まとめシートを作成しています" : "次の質問を考え中")} />) : null}
              {isTextStreaming && streamingText ? (<StreamingChatMessage streamingText={streamingText} isStreaming={true} />) : null}
              <div ref={conversationEndRef} />
            </div>
          )
        }
        composer={hasStarted && !isComplete ? (<div className="space-y-3">{nextQuestionHint ? (<div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground line-clamp-2"><span className="font-medium text-foreground">ヒント: </span>{nextQuestionHint}</div>) : null}<ChatInput value={answer} onChange={setAnswer} onSend={handleSend} isSending={isBusy} disableSend={!canSend} placeholder="回答を入力..." className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0" /></div>) : undefined}
        sidebar={
          <InterviewConversationSidebar
            state={{
              effectiveIndustry,
              feedbackHistories,
              hasStarted,
              isBusy,
              materials,
              questionCount,
              resolvedSelectedRole,
              sessionState,
              setupState,
              turnMeta,
            }}
            topicStages={topicStages}
            interviewPhases={interviewPhases}
            questionDisplay={questionDisplay}
            coachingNarrative={coachingNarrative}
            onOpenHistory={setSelectedHistory}
            onReset={handleReset}
          />
        }
      />
      <GenerationModal
        open={sheetGenerationOpen}
        onOpenChange={(next) => {
          if (!next) setSheetGenerationOpen(false);
        }}
        status={sheetStatus}
        icon="sheet"
        title="まとめシート作成"
        description="面接の回答をもとに、最終講評（まとめシート）を作成します。"
        helperText={feedbackHelperText}
        lockedReason="必要な質問が完了すると、まとめシートを作成できます。"
        requirements={[{ label: "必要な質問の完了", met: questionFlowCompleted }]}
        generatingSlot={<InterviewFeedbackStreamingView feedback={streamingFeedback} label={streamingLabel} />}
        resultSlot={
          <div className="space-y-5">
            <SheetViewer data={activeSheetData} markdownFallback={activeSheetFallback} />
            {feedback ? (
              <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                <p className="text-sm font-medium">今回の面接の満足度</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">不満</span>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <Button
                      key={score}
                      type="button"
                      variant={latestFeedbackHistory?.satisfactionScore === score ? "default" : "outline"}
                      size="sm"
                      disabled={isSavingSatisfaction}
                      onClick={() => handleSaveSatisfaction(score)}
                    >
                      {score}
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground">満足</span>
                </div>
              </div>
            ) : null}
            {feedback ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                  <p className="text-sm font-medium">次のアクション</p>
                  <div className="mt-3 space-y-3">
                    <Button onClick={handleContinue} disabled={!canContinue} className="w-full">
                      面接対策を続ける（{billingCosts.continue} credit）
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      <Link href="/interview/dashboard" className="text-primary underline-offset-2 hover:underline">
                        成長ダッシュボードで推移を見る
                      </Link>
                    </p>
                  </div>
                </div>
                {feedback.weakest_turn_id && feedback.weakest_question_snapshot ? (
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                    <p className="text-sm font-medium">最弱回答ドリル</p>
                    <Collapsible className="mt-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full justify-between text-left">
                          最弱回答を書き直して再採点する
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <DrillPanel
                          companyId={normalizedCompanyId}
                          weakestTurnId={feedback.weakest_turn_id}
                          weakestQuestion={feedback.weakest_question_snapshot}
                          weakestAnswer={feedback.weakest_answer_snapshot ?? ""}
                          weakestAxis={drillAxis}
                          originalScore={feedback.scores[drillAxis] ?? 0}
                          originalScores={feedbackScoreRecord}
                          originalFeedbackId={latestFeedbackHistory?.id}
                          interviewFormat={setupState.interviewFormat}
                          interviewerType={setupState.interviewerType}
                          strictnessMode={setupState.strictnessMode}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
        generateAction={{ label: "まとめシートを作成", onGenerate: handleGenerateFeedback }}
      />
      <SheetViewerDialog open={Boolean(selectedHistory)} onOpenChange={(open) => { if (!open) setSelectedHistory(null); }} data={selectedSheetData} markdownFallback={selectedSheetFallback} satisfactionScore={selectedHistory?.satisfactionScore ?? null} />
    </>
  );
}
