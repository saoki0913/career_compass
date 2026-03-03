"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReviewIssue } from "@/hooks/useESReview";
import { PriorityBadge, difficultyToPriority, type Difficulty } from "./PriorityBadge";

interface ImprovementListProps {
  issues: ReviewIssue[];
  title?: string;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

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

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
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
  title = "改善ポイント",
  className,
  collapsible = false,
  defaultExpanded = true,
}: ImprovementListProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (issues.length === 0) {
    return <div className={cn("py-4 text-center text-muted-foreground", className)}>改善ポイントはありません</div>;
  }

  const header = (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-700">
        {issues.length}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left"
        >
          {header}
          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
      ) : (
        header
      )}

      {(!collapsible || isExpanded) && (
        <div className="space-y-3">
          {issues.map((issue, index) => {
            const priority = difficultyToPriority(issue.difficulty as Difficulty | undefined);
            return (
              <div key={`${issue.category}-${index}`} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{issue.category}</span>
                  <PriorityBadge priority={priority} showLabel />
                </div>

                <div className="mt-3 flex items-start gap-2">
                  <span className="mt-0.5 text-amber-600">
                    <AlertIcon />
                  </span>
                  <p className="text-sm leading-6 text-foreground">{issue.issue}</p>
                </div>

                <div className="mt-3 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">
                      <LightbulbIcon />
                    </span>
                    <p className="text-sm leading-6 text-foreground/85">{issue.suggestion}</p>
                  </div>
                </div>

                {issue.why_now && (
                  <div className="mt-3 rounded-lg border border-border/70 bg-background p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-muted-foreground">
                        <ClockIcon />
                      </span>
                      <p className="text-sm leading-6 text-muted-foreground">{issue.why_now}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
