"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUILD_TRACK_KEYS,
  BUILD_TRACK_LABELS,
  getBuildItemStatus,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";

interface NaturalProgressStatusProps {
  state: ConversationState | null;
  /** Layout variant. `stacked` is the default (sidebar), `inline` compresses for mobile status chips. */
  variant?: "stacked" | "inline";
  /** Total user answers sent so far (drives the "N 問目" counter). */
  answeredCount?: number;
  className?: string;
}

type BuildItemStatus = "pending" | "current" | "done";

const STATUS_CHIP_CLASS: Record<BuildItemStatus, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  current: "border-sky-300 bg-sky-50 text-sky-800",
  pending: "border-border/60 bg-muted/30 text-muted-foreground",
};

const STATUS_DOT_CLASS: Record<BuildItemStatus, string> = {
  done: "bg-emerald-500",
  current: "bg-sky-500",
  pending: "bg-muted-foreground/30",
};

function stageRemainingLabel(state: ConversationState | null): string | null {
  if (!state) return null;
  if (state.stage === "interview_ready") {
    return "面接準備まで整いました。";
  }
  if (state.stage === "deep_dive_active") {
    return "深掘りで論点を整理しています。";
  }
  if (state.stage === "draft_ready" || state.readyForDraft) {
    return "ES 材料が揃いました。";
  }
  return null;
}

/** Fallback client-side heuristic used only when the server value is absent. */
function estimateRemainingQuestionsText(state: ConversationState | null): string | null {
  if (!state) return null;
  const stageLabel = stageRemainingLabel(state);
  if (stageLabel) return stageLabel;
  const remaining = state.missingElements.length;
  if (remaining === 0) return "まもなく材料が揃います。";
  if (remaining === 1) return "あと 1 問程度で材料が揃います。";
  if (remaining === 2) return "あと 1-2 問で材料が揃いそうです。";
  return "STAR の材料を順に整理していきましょう。";
}

/**
 * Render the "あと N 問" line for a server-provided integer count.
 *
 * Prefers stage-based messaging when the flow has already reached
 * draft_ready / deep_dive_active / interview_ready so we never display
 * "あと 0 問" for states that the server treats as "done".
 */
function remainingLabelFromServerCount(state: ConversationState | null, n: number): string {
  const stageLabel = stageRemainingLabel(state);
  if (stageLabel) return stageLabel;
  if (n <= 0) return "まもなく材料が揃います。";
  if (n === 1) return "あと 1 問で材料が揃います。";
  return `あと ${n} 問で材料が揃いそうです。`;
}

function estimateTotalQuestionCount(
  answeredCount: number,
  remainingLabel: string | null,
  serverRemaining: number | null,
): number {
  const baseline = 5;
  // Server value is authoritative when available: total ≈ answered + remaining.
  // When serverRemaining == 0 the flow is "done"; snap to answered (or baseline)
  // so the denominator does not stretch ahead of the numerator.
  if (serverRemaining !== null) {
    if (serverRemaining === 0) {
      return Math.max(answeredCount, baseline);
    }
    return Math.max(baseline, answeredCount + serverRemaining);
  }
  // Legacy heuristic: base of 5 questions, grow with answered so the denominator never lags behind.
  const grown = Math.max(baseline, answeredCount + 2);
  // If AI signals "material is ready", snap to current answered count (we are done).
  if (remainingLabel && /整いました|揃いました|整理しています/.test(remainingLabel)) {
    return Math.max(answeredCount, baseline);
  }
  return grown;
}

function BuildItemPill({
  label,
  status,
}: {
  label: string;
  status: BuildItemStatus;
}) {
  const chipClass = STATUS_CHIP_CLASS[status];
  const dotClass = STATUS_DOT_CLASS[status];
  const statusText = status === "done" ? "完了" : status === "current" ? "進行中" : "未着手";

  return (
    <div
      aria-label={`${label}: ${statusText}`}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
        chipClass,
      )}
    >
      <span className="relative inline-flex h-2 w-2 items-center justify-center">
        <span className={cn("absolute inline-flex h-2 w-2 rounded-full", dotClass)} />
        {status === "current" ? (
          <span className={cn("absolute inline-flex h-2 w-2 rounded-full opacity-60 animate-ping", dotClass)} />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
      {status === "done" ? <Check className="h-3 w-3" aria-hidden /> : null}
    </div>
  );
}

export function NaturalProgressStatus({
  state,
  variant = "stacked",
  answeredCount = 0,
  className,
}: NaturalProgressStatusProps) {
  // M4 (2026-04-17): server-side remainingQuestionsEstimate wins over the
  // client-side heuristic so the UI "あと N 問" stays in sync with the
  // server's ready_for_draft gate. Fall back to the legacy missingElements
  // estimate only when the server value is missing (older resume payload).
  const serverRemaining = state?.remainingQuestionsEstimate ?? null;
  const effectiveRemaining =
    typeof serverRemaining === "number" && Number.isFinite(serverRemaining) && serverRemaining >= 0
      ? Math.floor(serverRemaining)
      : null;
  const remainingLabel =
    effectiveRemaining !== null
      ? remainingLabelFromServerCount(state, effectiveRemaining)
      : estimateRemainingQuestionsText(state);
  // coach_progress_message wins over the remaining-questions line when both are present.
  const coachMessage = state?.coachProgressMessage?.trim() ?? "";
  const primaryLine = coachMessage || remainingLabel || "";
  const estimatedTotal = estimateTotalQuestionCount(answeredCount, remainingLabel, effectiveRemaining);
  const questionDisplay =
    answeredCount > 0
      ? `${Math.min(answeredCount, estimatedTotal)} 問目 / 約 ${estimatedTotal} 問`
      : "これから 1 問目";

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "space-y-2 text-[11px] text-muted-foreground",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="shrink-0 font-medium text-foreground/80">{questionDisplay}</span>
          {primaryLine ? (
            <span className="min-w-0 truncate text-right text-muted-foreground">{primaryLine}</span>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-1">
        {BUILD_TRACK_KEYS.map((key) => {
          const status = getBuildItemStatus(state, key);
          return (
            <span
              key={key}
              className={cn(
                "inline-flex min-w-0 items-center justify-center gap-1 rounded-full border px-1.5 py-1",
                STATUS_CHIP_CLASS[status],
              )}
              aria-label={`${BUILD_TRACK_LABELS[key]}: ${status === "done" ? "完了" : status === "current" ? "進行中" : "未着手"}`}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[status])} aria-hidden />
              <span className="truncate">{BUILD_TRACK_LABELS[key]}</span>
            </span>
          );
        })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">いまの進み具合</span>
        <span className="text-[11px] text-muted-foreground">{questionDisplay}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {BUILD_TRACK_KEYS.map((key) => (
          <BuildItemPill
            key={key}
            label={BUILD_TRACK_LABELS[key]}
            status={getBuildItemStatus(state, key)}
          />
        ))}
      </div>

      {primaryLine ? (
        <p className="text-xs leading-5 text-muted-foreground">{primaryLine}</p>
      ) : null}
    </div>
  );
}

export default NaturalProgressStatus;
