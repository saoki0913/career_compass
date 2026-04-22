"use client";

/**
 * Phase 2 Stage 8-3: Recurring issues list.
 * TOP 5 keywords extracted from the `improvements[]` field of the most recent
 * 3 feedback sessions.
 */

import type { RecurringIssue } from "@/lib/interview/dashboard";

export type RecurringIssuesListProps = {
  issues: RecurringIssue[];
};

export function RecurringIssuesList({ issues }: RecurringIssuesListProps) {
  if (issues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        直近 3 回の最終講評から、共通する改善キーワードはまだ抽出されていません。
      </p>
    );
  }

  return (
    <ol className="space-y-2 text-sm">
      {issues.map((issue, i) => (
        <li
          key={issue.keyword}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
              {i + 1}
            </span>
            <span className="font-medium text-foreground">{issue.keyword}</span>
          </div>
          <span className="text-xs text-muted-foreground">{issue.count} 回</span>
        </li>
      ))}
    </ol>
  );
}
