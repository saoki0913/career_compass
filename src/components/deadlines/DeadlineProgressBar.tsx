"use client";

import { cn } from "@/lib/utils";

interface DeadlineProgressBarProps {
  /** Completed count */
  value: number;
  /** Total count */
  max: number;
  /** Optional label (e.g. "3/5") shown to the right */
  label?: string;
  className?: string;
}

export function DeadlineProgressBar({
  value,
  max,
  label,
  className,
}: DeadlineProgressBarProps) {
  const percent = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${value}/${max} 完了`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            percent === 100
              ? "bg-success"
              : percent > 0
                ? "bg-primary"
                : "bg-transparent",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {label != null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
