"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

export interface PhaseItem {
  key: string;
  label: string;
  status: "done" | "current" | "pending";
}

interface ConversationPhaseBarProps {
  phases: PhaseItem[];
  compact?: boolean;
  className?: string;
}

const PHASE_CLASS: Record<PhaseItem["status"], string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  current: "border-sky-300 bg-sky-50 text-slate-900",
  pending: "border-border/60 bg-muted/20 text-muted-foreground",
};

const PHASE_LABEL: Record<PhaseItem["status"], string> = {
  done: "完了",
  current: "進行中",
  pending: "未着手",
};

export const ConversationPhaseBar = memo(function ConversationPhaseBar({
  phases,
  compact = false,
  className,
}: ConversationPhaseBarProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {phases.map((phase) => (
        <div
          key={phase.key}
          className={cn(
            "rounded-[18px] border text-xs shadow-sm",
            compact ? "px-3 py-2" : "px-3.5 py-2.5",
            PHASE_CLASS[phase.status],
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{phase.label}</span>
            <span>{PHASE_LABEL[phase.status]}</span>
          </div>
        </div>
      ))}
    </div>
  );
});
