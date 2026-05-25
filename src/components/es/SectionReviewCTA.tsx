"use client";

import { cn } from "@/lib/utils";

interface SectionReviewCTAProps {
  onReview: () => void;
  charCount: number;
  charLimit?: number;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const SparkleIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export function SectionReviewCTA({
  onReview,
  charCount,
  charLimit,
  isLoading = false,
  disabled = false,
  disabledReason,
}: SectionReviewCTAProps) {
  const isDisabled = disabled || isLoading;

  const charDisplay = charLimit
    ? `${charCount}/${charLimit}字`
    : charCount > 0
      ? `${charCount}字`
      : null;

  return (
    <button
      type="button"
      onClick={onReview}
      disabled={isDisabled}
      className={cn(
        "group flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-[13px] border px-4 py-3",
        "transition-all duration-200",
        isLoading
          ? "cursor-wait animate-pulse border-border bg-muted/50"
          : isDisabled
            ? "cursor-not-allowed border-border/50 bg-muted/30 opacity-55"
            : "cursor-pointer border-primary/35 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:border-primary/55 hover:bg-primary/8 hover:shadow-sm"
      )}
    >
      {/* Left: Icon + Label */}
      <div className="flex min-w-0 items-center gap-2.5">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <span className={cn(
            "shrink-0 transition-transform duration-200",
            !isDisabled && "group-hover:scale-110",
            isDisabled ? "text-muted-foreground" : "text-primary"
          )}>
            <SparkleIcon />
          </span>
        )}
        <span className={cn(
          "min-w-0 truncate text-sm font-semibold",
          isLoading
            ? "text-muted-foreground"
            : isDisabled
              ? "text-muted-foreground"
              : "text-primary"
        )}>
          {isLoading
            ? "添削中..."
            : disabledReason || "この設問をAI添削"}
        </span>
      </div>

      {/* Right: Character count badge */}
      {charDisplay && !isLoading && (
        <span className={cn(
          "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
          charLimit
            ? charCount > charLimit
              ? "bg-red-100 text-red-600"
              : "bg-emerald-100 text-emerald-700"
            : "bg-muted text-muted-foreground"
        )}>
          {charDisplay}
        </span>
      )}
    </button>
  );
}
