"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStage {
  key: string;
  label: string;
  status: "done" | "current" | "pending";
}

interface ConversationProgressBarProps {
  stages: ProgressStage[];
  headerTitle?: string;
  headerSubtext?: string;
  footerMessage?: string | null;
  variant?: "stacked" | "inline";
  columns?: number;
  children?: ReactNode;
  className?: string;
}

const STATUS_CHIP_CLASS: Record<ProgressStage["status"], string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  current: "border-sky-300 bg-sky-50 text-sky-800",
  pending: "border-border/60 bg-muted/30 text-muted-foreground",
};

const STATUS_DOT_CLASS: Record<ProgressStage["status"], string> = {
  done: "bg-emerald-500",
  current: "bg-sky-500",
  pending: "bg-muted-foreground/30",
};

const STATUS_A11Y_LABEL: Record<ProgressStage["status"], string> = {
  done: "完了",
  current: "進行中",
  pending: "未着手",
};

function getGridStyle(columns: number | undefined, stageCount: number) {
  const defaultColumns = stageCount > 4 ? 2 : stageCount || 1;
  const requestedColumns = columns ?? defaultColumns;
  const normalizedColumns = Number.isFinite(requestedColumns) ? Math.floor(requestedColumns) : defaultColumns;
  const safeColumns = Math.max(1, Math.min(normalizedColumns, 6));
  return {
    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
  };
}

function ProgressPill({
  label,
  status,
  compact = false,
}: {
  label: string;
  status: ProgressStage["status"];
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`${label}: ${STATUS_A11Y_LABEL[status]}`}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 rounded-full border font-medium transition-colors",
        compact ? "px-1.5 py-1 text-[11px]" : "px-2 py-1 text-[11px]",
        STATUS_CHIP_CLASS[status],
      )}
    >
      <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center">
        <span className={cn("absolute inline-flex h-2 w-2 rounded-full", STATUS_DOT_CLASS[status])} />
        {status === "current" ? (
          <span
            className={cn(
              "absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-60",
              STATUS_DOT_CLASS[status],
            )}
          />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
      {status === "done" ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
    </div>
  );
}

export const ConversationProgressBar = memo(function ConversationProgressBar({
  stages,
  headerTitle = "いまの進み具合",
  headerSubtext,
  footerMessage,
  variant = "stacked",
  columns,
  children,
  className,
}: ConversationProgressBarProps) {
  if (variant === "inline") {
    return (
      <div className={cn("space-y-2 text-[11px] text-muted-foreground", className)} role="status" aria-live="polite">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {headerSubtext ? (
            <span className="shrink-0 font-medium text-foreground/80">{headerSubtext}</span>
          ) : (
            <span className="shrink-0 font-medium text-foreground/80">{headerTitle}</span>
          )}
          {footerMessage ? (
            <span className="min-w-0 truncate text-right text-muted-foreground">{footerMessage}</span>
          ) : null}
        </div>
        {stages.length > 0 ? (
          <div className="grid gap-1" style={getGridStyle(columns, stages.length)}>
            {stages.map((stage) => (
              <ProgressPill key={stage.key} label={stage.label} status={stage.status} compact />
            ))}
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4", className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{headerTitle}</span>
        {headerSubtext ? <span className="text-[11px] text-muted-foreground">{headerSubtext}</span> : null}
      </div>

      {stages.length > 0 ? (
        <div className="grid gap-1.5" style={getGridStyle(columns, stages.length)}>
          {stages.map((stage) => (
            <ProgressPill key={stage.key} label={stage.label} status={stage.status} />
          ))}
        </div>
      ) : null}

      {children}

      {footerMessage ? <p className="text-xs leading-5 text-muted-foreground">{footerMessage}</p> : null}
    </div>
  );
});
