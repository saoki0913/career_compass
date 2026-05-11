"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DraftReadyCTAProps {
  variant: "pre-draft" | "post-draft";
  message: string;
  actionLabel: string;
  onAction: () => void;
  isActionDisabled?: boolean;
  isActionPending?: boolean;
}

const VARIANT_CLASSES = {
  "pre-draft": "rounded-xl border border-primary/20 bg-primary/5 p-4",
  "post-draft": "rounded-xl border border-emerald-200 bg-emerald-50/50 p-4",
} as const;

export function DraftReadyCTA({
  variant,
  message,
  actionLabel,
  onAction,
  isActionDisabled = false,
  isActionPending = false,
}: DraftReadyCTAProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant])}>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">{message}</p>
        <Button
          variant={variant === "pre-draft" ? "outline" : "default"}
          className="shrink-0 rounded-xl shadow-sm active:translate-y-px"
          onClick={onAction}
          disabled={isActionDisabled || isActionPending}
        >
          {isActionPending ? `${actionLabel}中...` : actionLabel}
        </Button>
      </div>
    </div>
  );
}
