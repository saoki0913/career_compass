"use client";

import { useMemo } from "react";
import type { ProgressStage } from "@/components/chat";
import { ConversationSidebar } from "@/components/chat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import {
  computePhaseItems,
  type StandardPhaseKey,
} from "@/lib/shared/conversation-lifecycle";
import {
  getMotivationSlotPillStatus,
  SLOT_PILL_LABELS,
  STAGE_ORDER,
  type CausalGap,
  type ConversationMode,
  type EvidenceCard,
  type MotivationStageKey,
  type StageStatus,
} from "@/features/motivation/domain/ui";
import { cn } from "@/lib/utils";

const SLOT_SIDEBAR_LABELS: Record<string, string> = {
  industry_reason: "業界への関心",
  company_reason: "企業を選ぶ理由",
  self_connection: "自分との接点",
  desired_work: "やりたい仕事",
  value_contribution: "貢献できること",
  differentiation: "自分ならではの強み",
};

const SLOT_DISPLAY_ORDER = [
  "industry_reason",
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
] as const;

type SlotKey = Exclude<MotivationStageKey, "closing">;

function formatQuestionDisplay(questionCount: number, conversationMode: ConversationMode): string {
  if (questionCount === 0) return "これから1問目";
  if (conversationMode === "slot_fill") return `${questionCount}問目 / 約6問`;
  return `${questionCount}問目 / 補強中`;
}

function toStandardPhase(
  isDraftReady: boolean,
  conversationMode: ConversationMode,
  hasNextQuestion: boolean,
  hasCausalGaps: boolean,
): StandardPhaseKey {
  if (!isDraftReady) return "questioning";
  if (conversationMode !== "deepdive") return "draft_ready";
  if (hasNextQuestion || hasCausalGaps) return "deep_dive";
  return "completed";
}

function CausalGapSteps({ gaps }: { gaps: CausalGap[] }) {
  return (
    <div className="space-y-0.5">
      {gaps.map((gap, index) => {
        const status: Extract<ProgressStage["status"], "current" | "pending"> = index === 0 ? "current" : "pending";
        return (
          <div key={gap.id} className="flex items-start gap-2.5 py-1">
            <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <span
                className={cn(
                  "absolute inline-flex h-2 w-2 rounded-full",
                  status === "current" ? "bg-sky-500" : "bg-muted-foreground/30",
                )}
              />
              {status === "current" ? (
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-sky-500 opacity-60" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-foreground/80">
                {SLOT_PILL_LABELS[gap.slot as SlotKey] || gap.slot}
              </p>
              {status === "current" ? (
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{gap.reason}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressDetailSection({
  currentSlotLabel,
  currentIntentLabel,
  nextAdvanceCondition,
}: {
  currentSlotLabel: string | null;
  currentIntentLabel: string | null;
  nextAdvanceCondition: string | null;
}) {
  const hasDetail =
    currentSlotLabel !== null ||
    currentIntentLabel !== null ||
    nextAdvanceCondition !== null;

  if (!hasDetail) return null;

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {currentSlotLabel !== null ? (
        <p>
          今確認していること:{" "}
          <span className="font-medium text-foreground/80">
            {currentSlotLabel}
          </span>
        </p>
      ) : null}
      {currentIntentLabel !== null ? (
        <p>
          今回知りたいこと:{" "}
          <span className="font-medium text-foreground/80">
            {currentIntentLabel}
          </span>
        </p>
      ) : null}
      {nextAdvanceCondition !== null ? (
        <p>
          次に進む条件:{" "}
          <span className="font-medium text-foreground/80">
            {nextAdvanceCondition}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function MotivationConversationSidebar({
  effectiveIndustry,
  selectedRoleName,
  generatedDraft,
  showSetupScreen,
  stageStatus,
  questionCount,
  conversationMode,
  coachingFocus,
  currentSlotLabel,
  currentIntentLabel,
  nextAdvanceCondition,
  isDraftReady,
  nextQuestion,
  causalGaps,
  evidenceCards,
  evidenceSummary,
  userEvidenceCards,
  slotSummaries,
  hasSavedConversation,
  isLocked,
  isSending,
  isGeneratingDraft,
  isResetting,
  isStartingConversation,
  draftHelperText,
  onResetConversation,
}: {
  effectiveIndustry: string;
  selectedRoleName: string;
  generatedDraft: string | null;
  showSetupScreen: boolean;
  stageStatus: StageStatus | null;
  questionCount: number;
  conversationMode: ConversationMode;
  coachingFocus: string | null;
  currentSlotLabel: string | null;
  currentIntentLabel: string | null;
  nextAdvanceCondition: string | null;
  isDraftReady: boolean;
  nextQuestion: string | null;
  causalGaps: CausalGap[];
  evidenceCards: EvidenceCard[];
  evidenceSummary: string | null;
  userEvidenceCards: EvidenceCard[];
  slotSummaries: Record<string, string>;
  hasSavedConversation: boolean;
  isLocked: boolean;
  isSending: boolean;
  isGeneratingDraft: boolean;
  isResetting: boolean;
  isStartingConversation: boolean;
  draftHelperText: string;
  onResetConversation: () => void;
}) {
  const isDeepDive = conversationMode === "deepdive";
  const questionDisplay = formatQuestionDisplay(questionCount, conversationMode);

  const progressStages = useMemo<ProgressStage[]>(() => {
    if (isDeepDive && causalGaps.length > 0) {
      return [];
    }
    return (STAGE_ORDER as SlotKey[]).map((slot) => ({
      key: slot,
      label: SLOT_PILL_LABELS[slot],
      status: getMotivationSlotPillStatus(slot, stageStatus),
    }));
  }, [causalGaps.length, isDeepDive, stageStatus]);

  const phases = useMemo(() => {
    const standardPhase = toStandardPhase(
      isDraftReady,
      conversationMode,
      Boolean(nextQuestion),
      causalGaps.length > 0,
    );
    return computePhaseItems(standardPhase, Boolean(generatedDraft?.trim()));
  }, [causalGaps.length, conversationMode, generatedDraft, isDraftReady, nextQuestion]);

  const badges = (
    <>
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
      {generatedDraft ? (
        <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
          ES下書き生成済み
        </Badge>
      ) : null}
    </>
  );

  const setupContent = showSetupScreen ? (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-sm font-medium text-foreground">開始前の設定</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        業界と職種を確定すると、この企業向けに質問が始まります。
      </p>
    </div>
  ) : undefined;

  const progressChildren = !showSetupScreen ? (
    <>
      {isDeepDive && causalGaps.length > 0 ? <CausalGapSteps gaps={causalGaps} /> : null}
      <ProgressDetailSection
        currentSlotLabel={currentSlotLabel}
        currentIntentLabel={currentIntentLabel}
        nextAdvanceCondition={nextAdvanceCondition}
      />
    </>
  ) : undefined;

  return (
    <ConversationSidebar
      progressStages={progressStages}
      progressHeaderSubtext={questionDisplay}
      progressFooterMessage={coachingFocus}
      progressColumns={STAGE_ORDER.length}
      phases={phases}
      helperText={draftHelperText}
      badges={badges}
      progressChildren={progressChildren}
      setupContent={setupContent}
      showReset={hasSavedConversation}
      onReset={onResetConversation}
      resetDisabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
      isResetting={isResetting}
    >
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

      {userEvidenceCards.length > 0 || Object.keys(slotSummaries).length > 0 ? (
        <Card className="border-border/50">
          <CardHeader className="px-3.5 py-2.5">
            <CardTitle className="text-sm font-medium">参考にしたユーザー情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3.5 pb-3.5 pt-0">
            {userEvidenceCards.length > 0 ? (
              <MotivationEvidenceSection
                evidenceCards={userEvidenceCards}
                evidenceSummary={null}
                compact
                showHeader={false}
              />
            ) : (
              SLOT_DISPLAY_ORDER.filter((s) => slotSummaries[s]).map((slot) => (
                <div key={slot}>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {SLOT_SIDEBAR_LABELS[slot] || "確認済みの情報"}
                  </p>
                  <p className="text-xs leading-5 text-foreground/80">
                    {slotSummaries[slot].length > 80
                      ? `${slotSummaries[slot].slice(0, 80)}...`
                      : slotSummaries[slot]}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </ConversationSidebar>
  );
}
