"use client";

import { FileText, PenLine, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReadyOutputAction = {
  key: string;
  label: string;
  description?: string;
  icon?: "draft" | "feedback" | "sheet";
  disabled?: boolean;
  /**
   * 生成中の既存処理がある状態。pending 中のクリックは新規生成ではなく、
   * 生成状況を表示しているモーダルを再表示する用途に限定する。
   */
  pending?: boolean;
  pendingLabel?: string;
  pendingAriaLabel?: string;
  onClick: () => void;
};

type ReadyOutputBarProps = {
  actions: ReadyOutputAction[];
  compact?: boolean;
  className?: string;
};

const iconMap = {
  draft: Sparkles,
  feedback: PenLine,
  sheet: FileText,
};

export function ReadyOutputBar({
  actions,
  compact = false,
  className,
}: ReadyOutputBarProps) {
  const visibleActions = actions.filter(Boolean);
  if (visibleActions.length === 0) return null;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        compact ? "xl:w-auto" : "",
        className,
      )}
    >
      <div className="flex w-full flex-wrap items-center justify-end gap-2 max-xl:justify-start">
        {visibleActions.map((action) => {
          const Icon = iconMap[action.icon ?? "draft"];
          const visibleLabel = action.pending
            ? action.pendingLabel || "生成状況を見る"
            : action.label;
          const ariaLabel = action.pending
            ? action.pendingAriaLabel || `${action.label}: 生成中 - クリックで進捗を確認`
            : action.description
              ? `${action.label}: ${action.description}`
              : action.label;
          return (
            <Button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.description}
              aria-label={ariaLabel}
              aria-haspopup="dialog"
              className={cn(
                "h-11 min-w-[10rem] justify-center gap-2 rounded-full bg-[#06142f] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#0a1e43]",
                action.pending && "border border-primary/30 bg-[#0a1e43] ring-2 ring-primary/15",
                "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{visibleLabel}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
