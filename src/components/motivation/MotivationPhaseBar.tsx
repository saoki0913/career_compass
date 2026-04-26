"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  MOTIVATION_LIFECYCLE_PHASES,
  getMotivationLifecyclePhase,
  getMotivationPhaseStatus,
  type PillStatus,
  type ConversationMode,
} from "@/lib/motivation/ui";

interface MotivationPhaseBarProps {
  isDraftReady: boolean;
  generatedDraft?: string | null;
  conversationMode: ConversationMode;
  hasNextQuestion: boolean;
  hasCausalGaps: boolean;
  className?: string;
}

function statusClass(status: PillStatus) {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "current") return "border-sky-300 bg-sky-50 text-slate-900";
  return "border-border/60 bg-muted/20 text-muted-foreground";
}

export const MotivationPhaseBar = memo(function MotivationPhaseBar({
  isDraftReady,
  generatedDraft,
  conversationMode,
  hasNextQuestion,
  hasCausalGaps,
  className,
}: MotivationPhaseBarProps) {
  const currentPhase = getMotivationLifecyclePhase(isDraftReady, conversationMode, hasNextQuestion, hasCausalGaps);
  const hasDraft = Boolean(generatedDraft?.trim());

  return (
    <div className={cn("space-y-2", className)}>
      {MOTIVATION_LIFECYCLE_PHASES.map((phase) => {
        let itemStatus = getMotivationPhaseStatus(phase.key, currentPhase);
        if (phase.key === "draft_ready" && hasDraft && itemStatus !== "done") {
          itemStatus = "done";
        }
        const label = phase.key === "draft_ready" && hasDraft
          ? "ES生成済み"
          : phase.label;
        return (
          <div key={phase.key} className={cn("rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm", statusClass(itemStatus))}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{label}</span>
              <span>{itemStatus === "done" ? "完了" : itemStatus === "current" ? "進行中" : "未着手"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
