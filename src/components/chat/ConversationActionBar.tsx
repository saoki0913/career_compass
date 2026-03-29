"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function LoadingSpinner() {
  return (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

interface ConversationActionBarProps {
  helperText: string;
  actionLabel: string;
  pendingLabel?: string;
  onAction: () => void;
  disabled?: boolean;
  isPending?: boolean;
  controls?: ReactNode;
  className?: string;
}

export function ConversationActionBar({
  helperText,
  actionLabel,
  pendingLabel,
  onAction,
  disabled = false,
  isPending = false,
  controls,
  className,
}: ConversationActionBarProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-border/70 bg-background/90 px-3 py-2 shadow-sm",
        className,
      )}
    >
      <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
        <p className="min-w-0 text-sm leading-6 text-muted-foreground xl:max-w-[34rem]">{helperText}</p>

        {controls ? <div className="flex items-center gap-2 xl:justify-self-end">{controls}</div> : null}

        <Button
          onClick={onAction}
          disabled={disabled || isPending}
          className={cn(
            "h-11 w-full rounded-2xl px-5 shadow-sm",
            controls ? "xl:min-w-[228px] xl:w-auto" : "xl:min-w-[260px] xl:w-auto",
          )}
        >
          {isPending ? (
            <>
              <LoadingSpinner />
              <span className="ml-2">{pendingLabel || `${actionLabel}中...`}</span>
            </>
          ) : (
            actionLabel
          )}
        </Button>
      </div>
    </div>
  );
}
