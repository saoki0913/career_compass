"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReviewIssue } from "@/hooks/useESReview";
import { PriorityBadge, difficultyToPriority, type Difficulty } from "./PriorityBadge";

// Map category names to score keys for scroll anchors
const CATEGORY_TO_SCORE_KEY: Record<string, string> = {
  論理: "logic",
  論理性: "logic",
  具体性: "specificity",
  熱意: "passion",
  企業接続: "company_connection",
  読みやすさ: "readability",
};

interface ImprovementListProps {
  issues: ReviewIssue[];
  title?: string;  // Optional custom title (defaults to "改善優先順位Top3")
  className?: string;
  collapsible?: boolean;  // Make the list collapsible
  defaultExpanded?: boolean;  // Initial expanded state when collapsible
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  論理: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  具体性: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/20",
  },
  熱意: {
    bg: "bg-accent/10",
    text: "text-accent-foreground",
    border: "border-accent/20",
  },
  企業接続: {
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/20",
  },
  読みやすさ: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  その他: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "簡易",
  medium: "中",
  hard: "難",
};

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string }> = {
  easy: { bg: "bg-success/15", text: "text-success" },
  medium: { bg: "bg-warning/15", text: "text-warning-foreground" },
  hard: { bg: "bg-destructive/15", text: "text-destructive" },
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

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

export function ImprovementList({
  issues,
  title,
  className,
  collapsible = false,
  defaultExpanded = true,
}: ImprovementListProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (issues.length === 0) {
    return (
      <div className={cn("text-center py-4 text-muted-foreground", className)}>
        改善点はありません
      </div>
    );
  }

  const displayTitle = title || "改善優先順位Top3";
  const displayCount = issues.length;

  const headerContent = (
    <div className="flex items-center gap-2">
      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">
        {displayCount}
      </span>
      <span>{displayTitle}</span>
      {collapsible && (
        <span className="ml-auto text-muted-foreground">
          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </span>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-3", className)} id="improvement-list">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left text-sm font-semibold flex items-center gap-2 hover:text-foreground/80 transition-colors"
        >
          {headerContent}
        </button>
      ) : (
        <h4 className="text-sm font-semibold flex items-center gap-2">
          {headerContent}
        </h4>
      )}

      {(!collapsible || isExpanded) && (
        <div className="space-y-2">
          {issues.map((issue, index) => {
            const colors = CATEGORY_COLORS[issue.category] || CATEGORY_COLORS["その他"];
            const scoreKey = CATEGORY_TO_SCORE_KEY[issue.category] || issue.category.toLowerCase();

            return (
              <div
                key={index}
                id={`issue-${scoreKey}`}
                className={cn(
                  "rounded-lg border p-3 transition-all hover:shadow-sm scroll-mt-4",
                  colors.border,
                  colors.bg
                )}
              >
              {/* Category Badge with Priority */}
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
                {/* Priority badge based on difficulty */}
                <PriorityBadge
                  priority={difficultyToPriority(issue.difficulty as Difficulty | undefined)}
                  showLabel={true}
                />
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
      )}
    </div>
  );
}
