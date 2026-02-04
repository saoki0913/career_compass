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
  title?: string;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}


// Icons
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

  const displayTitle = title || "改善ポイント";
  const displayCount = issues.length;

  const headerContent = (
    <div className="flex items-center gap-2 flex-1">
      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0">
        {displayCount}
      </span>
      <span className="font-medium">{displayTitle}</span>
    </div>
  );

  return (
    <div className={cn("space-y-3", className)} id="improvement-list">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left text-sm flex items-center gap-2 py-2 px-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors group"
        >
          {headerContent}
          {!isExpanded && (
            <span className="text-xs text-muted-foreground">
              クリックで展開
            </span>
          )}
          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </span>
        </button>
      ) : (
        <h4 className="text-sm flex items-center gap-2">
          {headerContent}
        </h4>
      )}

      {(!collapsible || isExpanded) && (
        <div className="space-y-3">
          {issues.map((issue, index) => {
            const scoreKey = CATEGORY_TO_SCORE_KEY[issue.category] || issue.category.toLowerCase();
            const priority = difficultyToPriority(issue.difficulty as Difficulty | undefined);

            return (
              <div
                key={index}
                id={`issue-${scoreKey}`}
                className="rounded-lg border border-border bg-muted/30 overflow-hidden transition-all hover:shadow-sm scroll-mt-4"
              >
                <div className="p-3 space-y-2">
                  {/* Header with category and priority */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground">
                      #{index + 1} {issue.category}
                    </span>
                    <PriorityBadge
                      priority={priority}
                      showLabel={true}
                    />
                  </div>

                  {/* Issue description */}
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-0.5 shrink-0">
                      <AlertIcon />
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{issue.issue}</p>
                  </div>

                  {/* Suggestion */}
                  <div className="flex items-start gap-2 bg-background/50 rounded-md p-2 -mx-1">
                    <span className="text-muted-foreground mt-0.5 shrink-0">
                      <LightbulbIcon />
                    </span>
                    <p className="text-sm text-muted-foreground leading-relaxed">{issue.suggestion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
