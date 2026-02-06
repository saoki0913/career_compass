"use client";

import { cn } from "@/lib/utils";

interface SectionReviewCTAProps {
  onReview: () => void;
  charCount: number;
  charLimit?: number;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  hasCompanyRag?: boolean;
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
  hasCompanyRag = false,
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
        "w-full rounded-lg py-3 px-4 flex items-center justify-between gap-3",
        "border transition-all duration-200 group",
        isLoading
          ? "bg-muted/50 border-border animate-pulse cursor-wait"
          : isDisabled
            ? "bg-muted/30 border-border/50 opacity-50 cursor-not-allowed"
            : "bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20 hover:from-primary/10 hover:via-primary/15 hover:to-primary/10 hover:border-primary/30 hover:shadow-sm cursor-pointer"
      )}
    >
      {/* Left: Icon + Label */}
      <div className="flex items-center gap-2 min-w-0">
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
          "text-sm font-medium truncate",
          isLoading
            ? "text-muted-foreground"
            : isDisabled
              ? "text-muted-foreground"
              : "text-primary"
        )}>
          {isLoading
            ? "添削中..."
            : disabledReason || (hasCompanyRag ? "企業情報をもとにAI添削する" : "この設問をAI添削する")}
        </span>
      </div>

      {/* Right: Character count badge */}
      {charDisplay && !isLoading && (
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full shrink-0",
          charLimit && charCount > charLimit
            ? "bg-red-100 text-red-600"
            : "bg-muted text-muted-foreground"
        )}>
          {charDisplay}
        </span>
      )}
    </button>
  );
}
