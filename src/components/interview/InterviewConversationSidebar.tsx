"use client";

import { ConversationPhaseBar } from "@/components/chat/ConversationPhaseBar";
import { ConversationProgressBar, type ProgressStage } from "@/components/chat/ConversationProgressBar";
import { ConversationSidebarCard } from "@/components/chat/ConversationWorkspaceShell";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PhaseItem } from "@/components/chat";
import type { InterviewTurnMeta } from "@/lib/interview/session";
import {
  INTERVIEWER_TYPE_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_STAGE_LABELS,
  ROLE_TRACK_LABELS,
  SELECTION_TYPE_LABELS,
  STRICTNESS_MODE_LABELS,
  type Feedback,
  type FeedbackHistoryItem,
  type InterviewSessionState,
  type MaterialCard,
  type SetupState,
} from "@/lib/interview/ui";

type InterviewSidebarState = {
  effectiveIndustry: string | null;
  feedbackHistories: FeedbackHistoryItem[];
  hasStarted: boolean;
  isBusy: boolean;
  materials: MaterialCard[];
  questionCount: number;
  resolvedSelectedRole: string | null;
  sessionState: InterviewSessionState;
  setupState: SetupState;
  turnMeta: InterviewTurnMeta | null;
};

type InterviewConversationSidebarProps = {
  state: InterviewSidebarState;
  topicStages: ProgressStage[];
  interviewPhases: PhaseItem[];
  questionDisplay: string;
  coachingNarrative: string | null;
  onOpenHistory: (item: FeedbackHistoryItem) => void;
  onReset: () => void;
};

export type InterviewScoreAxis = keyof Feedback["scores"];

const INTERVIEW_SCORE_AXES = [
  "company_fit",
  "role_fit",
  "specificity",
  "logic",
  "persuasiveness",
  "consistency",
  "credibility",
] as const satisfies readonly InterviewScoreAxis[];

export function resolveInterviewScoreAxis(value: string | null | undefined): InterviewScoreAxis {
  return value && INTERVIEW_SCORE_AXES.includes(value as InterviewScoreAxis) ? value as InterviewScoreAxis : "specificity";
}

export function InterviewMaterialsCard({ materials }: { materials: MaterialCard[] }) {
  const visibleMaterials = materials.slice(0, 5);

  if (materials.length === 0) {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        志望動機、ガクチカ、関連 ES がまだ少ないため、企業情報を軸に質問を組み立てます。
      </p>
    );
  }

  return (
    <div className="space-y-2">
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
            <p className="overflow-hidden text-[11px] leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {material.text}
            </p>
          }
        />
      ))}
    </div>
  );
}

export function FeedbackHistoryList({
  histories,
  onOpen,
}: {
  histories: FeedbackHistoryItem[];
  onOpen: (item: FeedbackHistoryItem) => void;
}) {
  if (histories.length === 0) {
    return <p className="text-xs text-muted-foreground">まだまとめシートの履歴はありません。</p>;
  }

  return (
    <div className="space-y-2">
      {histories.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item)}
          className="w-full rounded-xl border border-border/60 bg-muted/15 px-3 py-2 text-left transition hover:bg-muted/30"
        >
          <p className="text-[11px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" / "}
            {item.sourceQuestionCount}問
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/80">{item.overallComment}</p>
        </button>
      ))}
    </div>
  );
}

export function ResetConfirmButton({
  onReset,
  disabled,
  variant = "outline",
  size,
  className,
}: {
  onReset: () => void;
  disabled: boolean;
  variant?: "outline" | "default";
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} className={className}>
          会話をやり直す
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>面接対策をやり直しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            これまでの会話内容はすべて失われます。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={onReset}>やり直す</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InterviewConversationSidebar({
  state,
  topicStages,
  interviewPhases,
  questionDisplay,
  coachingNarrative,
  onOpenHistory,
  onReset,
}: InterviewConversationSidebarProps) {
  const {
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
  } = state;

  return (
    <>
      <ConversationSidebarCard
        title="進捗"
        actions={
          hasStarted ? (
            <ResetConfirmButton
              onReset={onReset}
              disabled={isBusy}
              size="sm"
              className="h-9 rounded-xl px-3 text-xs shadow-sm"
            />
          ) : null
        }
      >
        <div className="space-y-3">
          {sessionState.isActive ? (
            <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
              前回の続きです。現在 {sessionState.questionCount || questionCount} 問目まで進んでいます。やり直す場合は会話内容が破棄されます。
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {effectiveIndustry ? (
              <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                {effectiveIndustry}
              </Badge>
            ) : (
              <Badge variant="outline" className="px-3 py-1 text-[11px]">
                業界未設定
              </Badge>
            )}
            {resolvedSelectedRole ? (
              <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                職種: {resolvedSelectedRole}
              </Badge>
            ) : (
              <Badge variant="outline" className="px-3 py-1 text-[11px]">
                職種未選択
              </Badge>
            )}
            <Badge variant="outline" className="px-3 py-1 text-[11px]">
              {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}
            </Badge>
          </div>
          <ConversationProgressBar
            stages={topicStages}
            headerSubtext={questionDisplay}
            footerMessage={coachingNarrative}
            columns={2}
          />
          <ConversationPhaseBar phases={interviewPhases} />
        </div>
      </ConversationSidebarCard>

      <ConversationSidebarCard title="面接設定">
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>業界: {effectiveIndustry || "未設定"}</p>
          <p>職種: {resolvedSelectedRole || setupState.selectedRole || "未設定"}</p>
          <p>職種分類: {ROLE_TRACK_LABELS[setupState.roleTrack]}</p>
          <p>面接方式: {INTERVIEW_FORMAT_LABELS[setupState.interviewFormat]}</p>
          <p>選考種別: {SELECTION_TYPE_LABELS[setupState.selectionType]}</p>
          <p>面接段階: {INTERVIEW_STAGE_LABELS[setupState.interviewStage]}</p>
          <p>面接官: {INTERVIEWER_TYPE_LABELS[setupState.interviewerType]}</p>
          <p>厳しさ: {STRICTNESS_MODE_LABELS[setupState.strictnessMode]}</p>
          {turnMeta?.interviewSetupNote ? (
            <p className="pt-2 text-foreground/90">{turnMeta.interviewSetupNote}</p>
          ) : null}
        </div>
      </ConversationSidebarCard>

      <ConversationSidebarCard title="参考にする材料">
        <InterviewMaterialsCard materials={materials} />
      </ConversationSidebarCard>

      <ConversationSidebarCard title="過去のまとめシート">
        <FeedbackHistoryList histories={feedbackHistories} onOpen={onOpenHistory} />
      </ConversationSidebarCard>
    </>
  );
}
