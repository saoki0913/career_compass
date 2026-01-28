"use client";

import { cn } from "@/lib/utils";
import type { ReviewIssue } from "@/hooks/useESReview";

interface ImprovementListProps {
  issues: ReviewIssue[];
  className?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  論理: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  具体性: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  熱意: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  企業接続: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  読みやすさ: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  その他: {
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-gray-200",
  },
};

const AlertIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const LightbulbIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

export function ImprovementList({ issues, className }: ImprovementListProps) {
  if (issues.length === 0) {
    return (
      <div className={cn("text-center py-4 text-muted-foreground", className)}>
        改善点はありません
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">
          3
        </span>
        改善優先順位Top3
      </h4>

      <div className="space-y-2">
        {issues.map((issue, index) => {
          const colors = CATEGORY_COLORS[issue.category] || CATEGORY_COLORS["その他"];

          return (
            <div
              key={index}
              className={cn(
                "rounded-lg border p-3 transition-all hover:shadow-sm",
                colors.border,
                colors.bg
              )}
            >
              {/* Category Badge */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full",
                    colors.text,
                    "bg-white/50"
                  )}
                >
                  #{index + 1} {issue.category}
                </span>
              </div>

              {/* Issue */}
              <div className="flex items-start gap-2 mb-2">
                <span className="text-amber-500 mt-0.5 shrink-0">
                  <AlertIcon />
                </span>
                <p className="text-sm text-foreground">{issue.issue}</p>
              </div>

              {/* Suggestion */}
              <div className="flex items-start gap-2 pl-6">
                <span className="text-emerald-500 mt-0.5 shrink-0">
                  <LightbulbIcon />
                </span>
                <p className="text-sm text-muted-foreground">{issue.suggestion}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
