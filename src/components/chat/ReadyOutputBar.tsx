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
  pending?: boolean;
  pendingLabel?: string;
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
          return (
            <Button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled || action.pending}
              title={action.description}
              aria-label={action.description ? `${action.label}: ${action.description}` : action.label}
              className={cn(
                "h-11 min-w-[10rem] justify-center gap-2 rounded-full bg-[#06142f] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#0a1e43]",
                "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {action.pending ? action.pendingLabel || `${action.label}中...` : action.label}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
