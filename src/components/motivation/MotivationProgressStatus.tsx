"use client";

import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STAGE_ORDER,
  SLOT_PILL_LABELS,
  getMotivationSlotPillStatus,
  type PillStatus,
  type StageStatus,
  type ConversationMode,
  type MotivationStageKey,
} from "@/lib/motivation/ui";

type SlotKey = Exclude<MotivationStageKey, "closing">;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MotivationProgressStatusProps {
  stageStatus: StageStatus | null;
  questionCount: number;
  conversationMode: ConversationMode;
  coachingFocus: string | null;
  currentSlotLabel: string | null;
  currentIntentLabel: string | null;
  nextAdvanceCondition: string | null;
}

// ---------------------------------------------------------------------------
// Pill style maps (matches gakuchika NaturalProgressStatus palette)
// ---------------------------------------------------------------------------

const PILL_CHIP_CLASS: Record<PillStatus, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  current: "border-sky-300 bg-sky-50 text-sky-800",
  pending: "border-border/60 bg-muted/30 text-muted-foreground",
};

const PILL_DOT_CLASS: Record<PillStatus, string> = {
  done: "bg-emerald-500",
  current: "bg-sky-500",
  pending: "bg-muted-foreground/30",
};

const STATUS_A11Y_LABEL: Record<PillStatus, string> = {
  done: "完了",
  current: "進行中",
  pending: "未着手",
};

// ---------------------------------------------------------------------------
// MotivationSlotPill (local, not exported)
// ---------------------------------------------------------------------------

const MotivationSlotPill = memo(function MotivationSlotPill({
  label,
  status,
}: {
  label: string;
  status: PillStatus;
}) {
  const chipClass = PILL_CHIP_CLASS[status];
  const dotClass = PILL_DOT_CLASS[status];

  return (
    <div
      aria-label={`${label}: ${STATUS_A11Y_LABEL[status]}`}
      className={cn(
        "flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        chipClass,
      )}
    >
      <span className="relative inline-flex h-2 w-2 items-center justify-center">
        <span
          className={cn("absolute inline-flex h-2 w-2 rounded-full", dotClass)}
        />
        {status === "current" ? (
          <span
            className={cn(
              "absolute inline-flex h-2 w-2 rounded-full opacity-60 animate-ping",
              dotClass,
            )}
          />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
      {status === "done" ? <Check className="h-3 w-3" aria-hidden /> : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Question display helper
// ---------------------------------------------------------------------------

function formatQuestionDisplay(
  questionCount: number,
  conversationMode: ConversationMode,
): string {
  if (questionCount === 0) return "これから1問目";
  if (conversationMode === "slot_fill") return `${questionCount}問目 / 約6問`;
  return `${questionCount}問目 / 補強中`;
}

// ---------------------------------------------------------------------------
// MotivationProgressStatus
// ---------------------------------------------------------------------------

export const MotivationProgressStatus = memo(function MotivationProgressStatus({
  stageStatus,
  questionCount,
  conversationMode,
  coachingFocus,
  currentSlotLabel,
  currentIntentLabel,
  nextAdvanceCondition,
}: MotivationProgressStatusProps) {
  const questionDisplay = formatQuestionDisplay(questionCount, conversationMode);

  const hasDetail =
    currentSlotLabel !== null ||
    currentIntentLabel !== null ||
    nextAdvanceCondition !== null;

  return (
    <div
      className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4"
      role="status"
      aria-live="polite"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          いまの進み具合
        </span>
        <span className="text-[11px] text-muted-foreground">
          {questionDisplay}
        </span>
      </div>

      {/* Slot pill badges */}
      <div className="flex flex-wrap gap-1.5">
        {(STAGE_ORDER as SlotKey[]).map((slot) => (
          <MotivationSlotPill
            key={slot}
            label={SLOT_PILL_LABELS[slot]}
            status={getMotivationSlotPillStatus(slot, stageStatus)}
          />
        ))}
      </div>

      {/* Detail section */}
      {hasDetail ? (
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
      ) : null}

      {/* Coaching focus */}
      {coachingFocus ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {coachingFocus}
        </p>
      ) : null}
    </div>
  );
});

export default MotivationProgressStatus;
