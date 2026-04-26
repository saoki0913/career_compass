"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { ConversationActionBar } from "@/components/chat/ConversationActionBar";
import {
  ConversationSidebarCard,
  ConversationWorkspaceShell,
} from "@/components/chat/ConversationWorkspaceShell";
import { ChatInput, ChatMessage, ThinkingIndicator } from "@/components/chat";
import { DrillPanel } from "@/components/interview/DrillPanel";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import { InterviewConversationSkeleton } from "@/components/skeletons/InterviewConversationSkeleton";
import { PrepPack } from "@/components/interview/PrepPack";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type InterviewStageStatus,
  type InterviewStrictnessMode,
  type InterviewerType,
} from "@/lib/interview/session";
import { notifySuccess } from "@/lib/notifications";
import {
  INDUSTRY_SELECT_UNSET,
  INTERVIEWER_TYPE_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_STAGE_LABELS,
  PREMISE_CONSISTENCY_HELP,
  ROLE_SELECT_UNSET,
  ROLE_TRACK_LABELS,
  SELECTION_TYPE_LABELS,
  STRICTNESS_MODE_LABELS,
  scoreEntries,
  type Feedback,
  type FeedbackHistoryItem,
  type MaterialCard,
} from "@/lib/interview/ui";
import { buildPrepPackSections } from "@/lib/interview/prep-pack";

type LastFailedAction = "start" | "send" | "feedback" | "continue" | null;

type InterviewLifecyclePhase = "questions" | "feedback" | "complete";

function getLifecycleStatus(
  phase: InterviewLifecyclePhase,
  questionFlowCompleted: boolean,
  hasFeedback: boolean,
): "done" | "current" | "pending" {
  if (phase === "questions") return questionFlowCompleted ? "done" : "current";
  if (phase === "feedback") {
    if (hasFeedback) return "done";
    return questionFlowCompleted ? "current" : "pending";
  }
  return hasFeedback ? "done" : "pending";
}

const LIFECYCLE_PHASES: { key: InterviewLifecyclePhase; label: string }[] = [
  { key: "questions", label: "質問フェーズ" },
  { key: "feedback", label: "フィードバック" },
  { key: "complete", label: "面接完了" },
];

function lifecycleClass(status: "done" | "current" | "pending") {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "current") return "border-sky-300 bg-sky-50 text-slate-900";
  return "border-border/60 bg-muted/20 text-muted-foreground";
}

function InterviewProgressCard({
  stageStatus,
  questionCount,
  questionFlowCompleted,
  hasFeedback,
}: {
  stageStatus: InterviewStageStatus | null;
  questionCount: number;
  questionFlowCompleted: boolean;
  hasFeedback: boolean;
}) {
  if (!stageStatus) return null;
  const coveredTopics = Array.isArray(stageStatus.coveredTopics) ? stageStatus.coveredTopics : [];
  const remainingTopics = Array.isArray(stageStatus.remainingTopics) ? stageStatus.remainingTopics : [];
  const allTopics = [...coveredTopics, ...remainingTopics];
  const totalEstimate = Math.max(allTopics.length, questionCount) + remainingTopics.length;

  const currentTopic = stageStatus.currentTopicLabel;
  const narrative = currentTopic
    ? coveredTopics.includes(currentTopic)
      ? `${currentTopic}の深掘りが完了しました。`
      : `${currentTopic}について確認しています。`
    : questionCount === 0
      ? "初回質問を準備中"
      : null;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">いまの進み具合</p>
          <p className="text-[11px] text-muted-foreground">
            {questionCount}問目 / 約{totalEstimate}問
          </p>
        </div>
        {allTopics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {coveredTopics.map((topic) => (
              <span key={topic} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-900">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {topic} ✓
              </span>
            ))}
            {remainingTopics.map((topic) => (
              <span key={topic} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                {topic}
              </span>
            ))}
          </div>
        )}
        {narrative && (
          <p className="mt-3 text-xs text-muted-foreground">{narrative}</p>
        )}
      </div>
      <div className="space-y-1">
        {LIFECYCLE_PHASES.map((phase) => {
          const status = getLifecycleStatus(phase.key, questionFlowCompleted, hasFeedback);
          return (
            <div key={phase.key} className={`rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm ${lifecycleClass(status)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{phase.label}</span>
                <span>{status === "done" ? "完了" : status === "current" ? "進行中" : "未着手"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterviewMaterialsCard({ materials }: { materials: MaterialCard[] }) {
  const visibleMaterials = materials.slice(0, 5);

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
                      : material.kind === "industry_seed"
                        ? "業界"
                        : material.kind === "company_seed"
                          ? "企業"
                          : null
              }
              compact
              excerpt={
                <p className="text-[11px] leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {material.text}
                </p>
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

function FeedbackHistoryList({ histories, onOpen }: { histories: FeedbackHistoryItem[]; onOpen: (item: FeedbackHistoryItem) => void }) {
  if (histories.length === 0) {
    return <p className="text-xs text-muted-foreground">まだ最終講評の履歴はありません。</p>;
  }
  return (
    <div className="space-y-2">
      {histories.map((item) => (
        <button key={item.id} type="button" onClick={() => onOpen(item)} className="w-full rounded-xl border border-border/60 bg-muted/15 px-3 py-2 text-left transition hover:bg-muted/30">
          <p className="text-[11px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {" / "}{item.sourceQuestionCount}問
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/80">{item.overallComment}</p>
        </button>
      ))}
    </div>
  );
}

function InterviewFeedbackCard({ feedback, isStreaming = false, currentHistory, onSaveSatisfaction, isSavingSatisfaction }: { feedback: Feedback; isStreaming?: boolean; currentHistory?: FeedbackHistoryItem | null; onSaveSatisfaction?: (score: number) => void; isSavingSatisfaction?: boolean }) {
  const scoreRows = scoreEntries(feedback);
  const currentSatisfaction = currentHistory?.satisfactionScore ?? feedback.satisfaction_score ?? null;
  return (
    <Card className="border-border/50">
      <CardHeader className="py-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">最終講評</CardTitle>
          {isStreaming ? <span className="text-[11px] text-muted-foreground">生成中...</span> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <p className="min-h-12 text-sm leading-6 text-foreground/90">{feedback.overall_comment || (isStreaming ? "講評を組み立てています..." : "講評を表示できませんでした。")}</p>
        <div className="grid grid-cols-2 gap-3">
          {scoreRows.map(([label, score]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`mt-1 text-lg font-semibold ${typeof score === "number" ? (score >= 4 ? "text-emerald-600" : score <= 3 ? "text-amber-600" : "") : ""}`}>{score}{typeof score === "number" ? "/5" : ""}</p>
            </div>
          ))}
        </div>
        <div><p className="text-sm font-medium">良かった点</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{feedback.strengths.map((item) => (<li key={item}>• {item}</li>))}</ul></div>
        <div><p className="text-sm font-medium">改善点</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{feedback.improvements.map((item) => (<li key={item}>• {item}</li>))}</ul></div>
        {feedback.consistency_risks.length > 0 ? (<div><p className="text-sm font-medium">一貫性リスク</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{feedback.consistency_risks.map((item) => (<li key={item}>• {item}</li>))}</ul></div>) : null}
        <div><p className="text-sm font-medium">言い換え例</p><p className="mt-2 rounded-xl bg-muted px-4 py-3 text-sm leading-6">{feedback.improved_answer || (isStreaming ? "回答例を生成中..." : "まだありません")}</p></div>
        {feedback.weakest_question_snapshot || feedback.weakest_answer_snapshot ? (<div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border/60 bg-background px-4 py-3"><p className="text-xs text-muted-foreground">最弱設問</p><p className="mt-2 text-sm leading-6 text-foreground/90">{feedback.weakest_question_snapshot || "記録がありません"}</p></div><div className="rounded-xl border border-border/60 bg-background px-4 py-3"><p className="text-xs text-muted-foreground">そのときの回答</p><p className="mt-2 text-sm leading-6 text-foreground/90">{feedback.weakest_answer_snapshot || "記録がありません"}</p></div></div>) : null}
        <div><p className="text-sm font-medium">次に準備すべき論点</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{feedback.next_preparation.map((item) => (<li key={item}>• {item}</li>))}</ul></div>
        {feedback.weakest_question_type ? (<p className="text-xs text-muted-foreground">最も弱かった設問タイプ: {feedback.weakest_question_type}</p>) : null}
        {typeof feedback.premise_consistency === "number" ? (<p className="text-xs text-muted-foreground">前提一致度: {feedback.premise_consistency} / 100 · {PREMISE_CONSISTENCY_HELP}</p>) : null}
        {!isStreaming && currentHistory ? (<div className="rounded-xl border border-border/60 bg-background px-4 py-3"><p className="text-sm font-medium">今回の面接の満足度</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">不満</span>{[1, 2, 3, 4, 5].map((score) => (<Button key={score} type="button" variant={currentSatisfaction === score ? "default" : "outline"} size="sm" disabled={isSavingSatisfaction} onClick={() => onSaveSatisfaction?.(score)}>{score}</Button>))}<span className="text-xs text-muted-foreground">満足</span></div><p className="mt-2 text-xs text-muted-foreground">{currentSatisfaction ? `保存済み: ${currentSatisfaction} / 5` : "1〜5 で回答すると改善指標に反映されます。"}</p></div>) : null}
      </CardContent>
    </Card>
  );
}

function ResetConfirmButton({ onReset, disabled, variant = "outline", size, className }: { onReset: () => void; disabled: boolean; variant?: "outline" | "default"; size?: "sm" | "default"; className?: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant={variant} size={size} disabled={disabled} className={className}>会話をやり直す</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>面接対策をやり直しますか？</AlertDialogTitle><AlertDialogDescription>これまでの会話内容はすべて失われます。この操作は取り消せません。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={onReset}>やり直す</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InterviewPageContent({ companyId }: { companyId: string | string[] | undefined }) {
  const { normalizedCompanyId } = useInterviewViewModel({ companyId, feedback: null });
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const feedbackCardRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const lastAnnouncedFeedbackCompletionCountRef = useRef(0);
  const [lastFailedAction, setLastFailedAction] = useState<LastFailedAction>(null);

  const { state, actions } = useInterviewConversationController({ companyId: normalizedCompanyId, enabled: Boolean(normalizedCompanyId) });
  const { companyName, materials, messages, answer, feedback, streamingFeedback, feedbackHistories, selectedHistory, questionCount, stageStatus, turnState, turnMeta, interviewPlan, streamingLabel, pendingAssistantMessage, streamingText, isTextStreaming, isLoading, isGeneratingFeedback, isSavingSatisfaction, questionFlowCompleted, error, errorAction, persistenceUnavailable, persistenceDeveloperHint, setupState, roleOptionsData, selectedRoleName, customRoleName, roleSelectionSource, effectiveIndustry, resolvedSelectedRole, setupComplete, hasStarted, isBusy, isComplete, visibleFeedback, canSend, canGenerateFeedback, canContinue, latestFeedbackHistory, feedbackHelperText, feedbackCompletionCount } = state;

  const { weakestAxis } = useInterviewViewModel({ companyId, feedback });
  const { setAnswer, setSetupState, setSelectedHistory, selectRole, setCustomRoleName, start: rawStart, send: rawSend, generateFeedback: rawGenerateFeedback, continueInterview: rawContinue, reset: handleReset, saveSatisfaction: handleSaveSatisfaction } = actions;

  const handleStart = useCallback(async () => { setLastFailedAction(null); try { await rawStart(); } catch { setLastFailedAction("start"); } }, [rawStart]);
  const handleSend = useCallback(async () => { setLastFailedAction(null); try { await rawSend(); } catch { setLastFailedAction("send"); } }, [rawSend]);
  const handleGenerateFeedback = useCallback(async () => { setLastFailedAction(null); try { await rawGenerateFeedback(); } catch { setLastFailedAction("feedback"); } }, [rawGenerateFeedback]);
  const handleContinue = useCallback(async () => { setLastFailedAction(null); try { await rawContinue(); } catch { setLastFailedAction("continue"); } }, [rawContinue]);
  const handleRetry = useCallback(() => { if (lastFailedAction === "start") handleStart(); else if (lastFailedAction === "send") handleSend(); else if (lastFailedAction === "feedback") handleGenerateFeedback(); else if (lastFailedAction === "continue") handleContinue(); }, [lastFailedAction, handleStart, handleSend, handleGenerateFeedback, handleContinue]);

  useEffect(() => { const viewport = conversationRef.current?.parentElement; if (!viewport) return; const handleScroll = () => { const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight; autoScrollEnabledRef.current = distanceFromBottom < 96; }; handleScroll(); viewport.addEventListener("scroll", handleScroll); return () => viewport.removeEventListener("scroll", handleScroll); }, [hasStarted]);
  useEffect(() => { if (!autoScrollEnabledRef.current) return; conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, streamingText, streamingFeedback?.overall_comment, streamingFeedback?.improved_answer, streamingFeedback?.strengths.length, streamingFeedback?.improvements.length, streamingFeedback?.next_preparation.length, streamingFeedback?.consistency_risks.length]);
  useEffect(() => { if (!feedback || feedbackCompletionCount <= lastAnnouncedFeedbackCompletionCountRef.current) return; lastAnnouncedFeedbackCompletionCountRef.current = feedbackCompletionCount; notifySuccess({ title: "最終講評を生成しました", description: "講評カードを表示しました。内容を確認しながら振り返れます。", duration: 4200 }); requestAnimationFrame(() => { feedbackCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }); }, [feedback, feedbackCompletionCount]);

  if (isLoading) { return (<div className="min-h-screen bg-background"><main><InterviewConversationSkeleton accent="面接の準備を進めています" /></main></div>); }
  if (!normalizedCompanyId) { return (<div className="min-h-screen bg-background"><main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Card className="border-border/60"><CardHeader><CardTitle className="text-base">企業を特定できません</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">URLが不完全な可能性があります。企業一覧から対象の企業を開き直してください。</p><Button asChild className="w-full sm:w-auto"><Link href="/companies">企業一覧へ</Link></Button></CardContent></Card></main></div>); }

  return (
    <>
      <ConversationWorkspaceShell
        backHref={`/companies/${normalizedCompanyId}`}
        title="面接対策"
        subtitle={companyName || "企業特化模擬面接"}
        actionBar={<ConversationActionBar helperText={feedbackHelperText} actionLabel="最終講評を作成" pendingLabel="講評を作成中..." onAction={handleGenerateFeedback} disabled={!canGenerateFeedback || persistenceUnavailable} isPending={isGeneratingFeedback} />}
        mobileStatus={<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{turnMeta?.interviewSetupNote || stageStatus?.currentTopicLabel || "開始前"}</span><span>{questionCount > 0 ? `${questionCount}問目` : "開始前"}</span></div>}
        conversation={
          !hasStarted ? (
            <div className="space-y-6 px-3 py-2 sm:px-4">
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-5 py-4"><p className="text-sm leading-7 text-foreground/90">開始前に応募職種、面接方式、選考種別、面接段階、面接官タイプ、厳しさを確認します。その前提で面接計画を作り、1問ずつ深掘りしながら企業に刺さる回答へ整えます。</p></div>
              <Card className="border-border/60">
                <CardHeader><CardTitle className="text-base">面接の前提を決める</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  {setupState.requiresIndustrySelection ? (<div className="space-y-2"><p className="text-sm font-medium">業界</p><Select value={effectiveIndustry || INDUSTRY_SELECT_UNSET} onValueChange={(value) => setSetupState((prev) => ({ ...prev, selectedIndustry: value === INDUSTRY_SELECT_UNSET ? null : value }))}><SelectTrigger className="w-full"><SelectValue placeholder="業界を選択" /></SelectTrigger><SelectContent><SelectItem value={INDUSTRY_SELECT_UNSET}>業界を選択</SelectItem>{setupState.industryOptions.map((industry) => (<SelectItem key={industry} value={industry}>{industry}</SelectItem>))}</SelectContent></Select></div>) : (<div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">業界: {effectiveIndustry || "未設定"}</div>)}
                  <div className="space-y-2"><p className="text-sm font-medium">職種</p><Select value={roleSelectionSource === "custom" ? ROLE_SELECT_UNSET : (selectedRoleName || ROLE_SELECT_UNSET)} onValueChange={(value) => { selectRole(value, ROLE_SELECT_UNSET); }}><SelectTrigger className="w-full"><SelectValue placeholder="候補から選択" /></SelectTrigger><SelectContent><SelectItem value={ROLE_SELECT_UNSET}>候補から選択</SelectItem>{roleOptionsData?.roleGroups.map((group) => (<SelectGroup key={group.id}><SelectLabel>{group.label}</SelectLabel>{group.options.map((option) => (<SelectItem key={`${group.id}-${option.value}`} value={option.value}>{option.label}</SelectItem>))}</SelectGroup>))}</SelectContent></Select><Input value={customRoleName} onChange={(event) => setCustomRoleName(event.target.value)} placeholder="候補にない場合は自由入力" /></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><p className="text-sm font-medium">面接方式</p><Select value={setupState.interviewFormat} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewFormat: value as InterviewFormat }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接方式を選択" /></SelectTrigger><SelectContent>{INTERVIEW_FORMAT_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEW_FORMAT_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">選考種別</p><Select value={setupState.selectionType} onValueChange={(value) => setSetupState((prev) => ({ ...prev, selectionType: value as InterviewSelectionType }))}><SelectTrigger className="w-full"><SelectValue placeholder="選考種別を選択" /></SelectTrigger><SelectContent>{SELECTION_TYPE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{SELECTION_TYPE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">面接段階</p><Select value={setupState.interviewStage} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewStage: value as InterviewRoundStage }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接段階を選択" /></SelectTrigger><SelectContent>{INTERVIEW_STAGE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEW_STAGE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2"><p className="text-sm font-medium">面接官タイプ</p><Select value={setupState.interviewerType} onValueChange={(value) => setSetupState((prev) => ({ ...prev, interviewerType: value as InterviewerType }))}><SelectTrigger className="w-full"><SelectValue placeholder="面接官タイプを選択" /></SelectTrigger><SelectContent>{INTERVIEWER_TYPE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{INTERVIEWER_TYPE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                    <div className="space-y-2 md:col-span-2"><p className="text-sm font-medium">厳しさ</p><Select value={setupState.strictnessMode} onValueChange={(value) => setSetupState((prev) => ({ ...prev, strictnessMode: value as InterviewStrictnessMode }))}><SelectTrigger className="w-full"><SelectValue placeholder="厳しさを選択" /></SelectTrigger><SelectContent>{STRICTNESS_MODE_OPTIONS.map((option) => (<SelectItem key={option} value={option}>{STRICTNESS_MODE_LABELS[option]}</SelectItem>))}</SelectContent></Select></div>
                  </div>
                  {(effectiveIndustry || resolvedSelectedRole) && (<div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"><p>業界: {effectiveIndustry || "未設定"}</p><p>職種: {resolvedSelectedRole || "未設定"}</p><p>職種分類: {ROLE_TRACK_LABELS[setupState.roleTrack]}</p><p>面接方式: {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}</p><p>選考種別: {SELECTION_TYPE_LABELS[setupState.selectionType]}</p><p>段階: {INTERVIEW_STAGE_LABELS[setupState.interviewStage]}</p><p>面接官: {INTERVIEWER_TYPE_LABELS[setupState.interviewerType]}</p><p>厳しさ: {STRICTNESS_MODE_LABELS[setupState.strictnessMode]}</p></div>)}
                  <div className="space-y-3">
                    <Button onClick={handleStart} disabled={!setupComplete || isBusy || persistenceUnavailable} className="w-full sm:w-auto">{isBusy ? (<><svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg><span className="ml-2">準備中...</span></>) : ("面接対策を始める")}</Button>
                    {!setupComplete && !isBusy && !persistenceUnavailable ? (<p className="text-xs text-muted-foreground">職種を入力すると開始できます</p>) : null}
                    {error ? (<div className="flex items-center gap-2"><p className="text-sm text-destructive">{error}</p>{lastFailedAction ? (<Button variant="outline" size="sm" onClick={handleRetry} disabled={isBusy}>再試行</Button>) : null}</div>) : null}
                    {errorAction ? <p className="text-xs text-muted-foreground">{errorAction}</p> : null}
                    {persistenceUnavailable ? (<div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">現在、面接対策の保存機能を一時的に利用できません。しばらくしてから再度お試しください。{persistenceDeveloperHint ? (<p className="mt-2 text-xs text-destructive/80">開発用メモ: {persistenceDeveloperHint}</p>) : null}</div>) : null}
                  </div>
                </CardContent>
              </Card>
              <PrepPack companyName={companyName ?? null} sections={buildPrepPackSections({ materials, interviewPlan, recentFeedbackHistories: feedbackHistories })} />
            </div>
          ) : (
            <div ref={conversationRef} className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-4 text-sm text-muted-foreground"><div className="flex flex-wrap gap-x-4 gap-y-2"><span>職種: {resolvedSelectedRole || setupState.selectedRole || "未設定"}</span><span>職種分類: {ROLE_TRACK_LABELS[setupState.roleTrack]}</span><span>方式: {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}</span><span>段階: {INTERVIEW_STAGE_LABELS[setupState.interviewStage]}</span><span>面接官: {INTERVIEWER_TYPE_LABELS[setupState.interviewerType]}</span><span>厳しさ: {STRICTNESS_MODE_LABELS[setupState.strictnessMode]}</span></div>{turnMeta?.interviewSetupNote ? (<p className="mt-3 text-foreground/90">{turnMeta.interviewSetupNote}</p>) : null}</div>
              {messages.map((message, index) => (<ChatMessage key={`${message.role}-${index}-${message.content.slice(0, 20)}`} role={message.role} content={message.content} />))}
              {isBusy && !isTextStreaming && !streamingText && !streamingFeedback?.overall_comment && !streamingFeedback?.improved_answer ? (<ThinkingIndicator text={streamingLabel || (isGeneratingFeedback ? "最終講評をまとめています" : "次の質問を考え中")} />) : null}
              {isTextStreaming && streamingText ? (<ChatMessage role="assistant" content={streamingText} isStreaming />) : null}
              {questionFlowCompleted && !feedback ? (<div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">{questionCount}問の回答が完了しました。内容を振り返ったうえで、上部の「最終講評を作成」から企業別の講評を生成できます。</div>) : null}
              {visibleFeedback ? (<div ref={feedbackCardRef} className="space-y-3"><InterviewFeedbackCard feedback={visibleFeedback} isStreaming={!feedback} currentHistory={feedback ? latestFeedbackHistory : null} onSaveSatisfaction={feedback ? handleSaveSatisfaction : undefined} isSavingSatisfaction={isSavingSatisfaction} />{feedback ? (<>{feedback.weakest_turn_id && feedback.weakest_question_snapshot && normalizedCompanyId ? (<Collapsible><CollapsibleTrigger asChild><Button variant="outline" className="w-full justify-between">最弱回答を書き直して再採点する<ChevronDown className="h-4 w-4" /></Button></CollapsibleTrigger><CollapsibleContent className="mt-3"><DrillPanel companyId={normalizedCompanyId} weakestTurnId={feedback.weakest_turn_id} weakestQuestion={feedback.weakest_question_snapshot} weakestAnswer={feedback.weakest_answer_snapshot ?? ""} weakestAxis={weakestAxis ?? "specificity"} originalScore={weakestAxis ? (feedback.scores[weakestAxis as keyof Feedback["scores"]] ?? 0) : 0} originalScores={feedback.scores as Record<string, number>} originalFeedbackId={latestFeedbackHistory?.id} interviewFormat={setupState.interviewFormat} interviewerType={setupState.interviewerType} strictnessMode={setupState.strictnessMode} /></CollapsibleContent></Collapsible>) : null}<div className="flex flex-wrap gap-3"><Button onClick={handleContinue} disabled={!canContinue || persistenceUnavailable}>面接対策を続ける</Button><ResetConfirmButton onReset={handleReset} disabled={isBusy || persistenceUnavailable} /></div><p className="text-xs text-muted-foreground"><Link href="/interview/dashboard" className="text-primary underline-offset-2 hover:underline">成長ダッシュボードで推移を見る →</Link></p></>) : null}</div>) : null}
              {error ? (<div className="flex items-center gap-2"><p className="text-sm text-destructive">{error}</p>{lastFailedAction ? (<Button variant="outline" size="sm" onClick={handleRetry} disabled={isBusy}>再試行</Button>) : null}</div>) : null}
              {errorAction ? <p className="text-xs text-muted-foreground">{errorAction}</p> : null}
              <div ref={conversationEndRef} />
            </div>
          )
        }
        composer={hasStarted && !isComplete ? (questionFlowCompleted ? (<p className="text-sm text-muted-foreground">模擬面接は完了です。必要になったら上部のボタンから最終講評を作成してください。</p>) : (<ChatInput value={answer} onChange={setAnswer} onSend={handleSend} isSending={isBusy} disableSend={!canSend || persistenceUnavailable} placeholder="回答を入力..." className="border-t-0 [&>div]:max-w-none [&>div]:px-0 [&>div]:py-0" />)) : undefined}
        sidebar={<><ConversationSidebarCard title="進捗" actions={hasStarted ? (<ResetConfirmButton onReset={handleReset} disabled={isBusy || persistenceUnavailable} size="sm" className="h-9 rounded-xl px-3 text-xs shadow-sm" />) : null}><InterviewProgressCard stageStatus={stageStatus} questionCount={questionCount} questionFlowCompleted={questionFlowCompleted} hasFeedback={!!feedback} /></ConversationSidebarCard><ConversationSidebarCard title="面接設定"><div className="space-y-2 text-xs text-muted-foreground"><p>業界: {effectiveIndustry || "未設定"}</p><p>職種: {resolvedSelectedRole || setupState.selectedRole || "未設定"}</p><p>職種分類: {ROLE_TRACK_LABELS[setupState.roleTrack]}</p><p>面接方式: {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}</p><p>選考種別: {SELECTION_TYPE_LABELS[setupState.selectionType]}</p><p>面接段階: {INTERVIEW_STAGE_LABELS[setupState.interviewStage]}</p><p>面接官: {INTERVIEWER_TYPE_LABELS[setupState.interviewerType]}</p><p>厳しさ: {STRICTNESS_MODE_LABELS[setupState.strictnessMode]}</p></div></ConversationSidebarCard><ConversationSidebarCard title="参考にする材料"><InterviewMaterialsCard materials={materials} /></ConversationSidebarCard><ConversationSidebarCard title="過去の最終講評"><FeedbackHistoryList histories={feedbackHistories} onOpen={setSelectedHistory} /></ConversationSidebarCard></>}
      />
      <Dialog open={Boolean(selectedHistory)} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4"><DialogTitle>過去の最終講評</DialogTitle><DialogDescription>直近の講評を全文表示しています。面接対策を続ける前の振り返りに使えます。</DialogDescription></DialogHeader>
          {selectedHistory ? (<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm"><p className="leading-7 text-foreground/90">{selectedHistory.overallComment}</p><div><p className="font-medium">良かった点</p><ul className="mt-2 space-y-2 text-muted-foreground">{selectedHistory.strengths.map((item) => (<li key={item}>• {item}</li>))}</ul></div><div><p className="font-medium">改善点</p><ul className="mt-2 space-y-2 text-muted-foreground">{selectedHistory.improvements.map((item) => (<li key={item}>• {item}</li>))}</ul></div>{selectedHistory.consistencyRisks.length > 0 ? (<div><p className="font-medium">一貫性リスク</p><ul className="mt-2 space-y-2 text-muted-foreground">{selectedHistory.consistencyRisks.map((item) => (<li key={item}>• {item}</li>))}</ul></div>) : null}<div><p className="font-medium">言い換え例</p><p className="mt-2 rounded-xl bg-muted px-4 py-3 leading-7">{selectedHistory.improvedAnswer}</p></div>{selectedHistory.weakestQuestionSnapshot || selectedHistory.weakestAnswerSnapshot ? (<div className="grid gap-3 md:grid-cols-2"><div><p className="font-medium">最弱設問</p><p className="mt-2 rounded-xl bg-muted px-4 py-3 leading-7">{selectedHistory.weakestQuestionSnapshot || "記録がありません"}</p></div><div><p className="font-medium">そのときの回答</p><p className="mt-2 rounded-xl bg-muted px-4 py-3 leading-7">{selectedHistory.weakestAnswerSnapshot || "記録がありません"}</p></div></div>) : null}<div><p className="font-medium">次に準備すべき論点</p><ul className="mt-2 space-y-2 text-muted-foreground">{selectedHistory.nextPreparation.map((item) => (<li key={item}>• {item}</li>))}</ul></div>{selectedHistory.weakestQuestionType ? (<p className="text-xs text-muted-foreground">最も弱かった設問タイプ: {selectedHistory.weakestQuestionType}</p>) : null}{selectedHistory.satisfactionScore ? (<p className="text-xs text-muted-foreground">満足度: {selectedHistory.satisfactionScore} / 5</p>) : null}<p className="text-xs text-muted-foreground">前提一致度: {selectedHistory.premiseConsistency} / 100 · {PREMISE_CONSISTENCY_HELP}</p></div>) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
