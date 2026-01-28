"use client";

import { cn } from "@/lib/utils";
import type { ReviewScores } from "@/hooks/useESReview";

interface ScoreDisplayProps {
  scores: ReviewScores;
  hasCompanyRag: boolean;
  className?: string;
}

interface ScoreBarProps {
  label: string;
  value: number;
  color: string;
}

function ScoreBar({ label, value, color }: ScoreBarProps) {
  const percentage = (value / 5) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-bold w-6 text-right">{value}</span>
    </div>
  );
}

const SCORE_CONFIG: Record<keyof ReviewScores, { label: string; color: string }> = {
  logic: {
    label: "論理",
    color: "bg-blue-500",
  },
  specificity: {
    label: "具体性",
    color: "bg-emerald-500",
  },
  passion: {
    label: "熱意",
    color: "bg-orange-500",
  },
  company_connection: {
    label: "企業接続",
    color: "bg-purple-500",
  },
  readability: {
    label: "読みやすさ",
    color: "bg-cyan-500",
  },
};

export function ScoreDisplay({ scores, hasCompanyRag, className }: ScoreDisplayProps) {
  // Calculate average score
  const scoreValues = Object.entries(scores)
    .filter(([key]) => key !== "company_connection" || hasCompanyRag)
    .map(([, value]) => value as number);
  const average = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;

  const getGradeColor = (avg: number) => {
    if (avg >= 4) return "text-emerald-500";
    if (avg >= 3) return "text-blue-500";
    if (avg >= 2) return "text-amber-500";
    return "text-red-500";
  };

  const getGradeLabel = (avg: number) => {
    if (avg >= 4.5) return "A+";
    if (avg >= 4) return "A";
    if (avg >= 3.5) return "B+";
    if (avg >= 3) return "B";
    if (avg >= 2.5) return "C+";
    if (avg >= 2) return "C";
    return "D";
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall Grade */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground">総合評価</p>
          <p className="text-sm font-medium">{average.toFixed(1)} / 5.0</p>
        </div>
        <div className={cn("text-3xl font-bold", getGradeColor(average))}>
          {getGradeLabel(average)}
        </div>
      </div>

      {/* Individual Scores */}
      <div className="space-y-3">
        <ScoreBar
          label={SCORE_CONFIG.logic.label}
          value={scores.logic}
          color={SCORE_CONFIG.logic.color}
        />
        <ScoreBar
          label={SCORE_CONFIG.specificity.label}
          value={scores.specificity}
          color={SCORE_CONFIG.specificity.color}
        />
        <ScoreBar
          label={SCORE_CONFIG.passion.label}
          value={scores.passion}
          color={SCORE_CONFIG.passion.color}
        />
        {hasCompanyRag && scores.company_connection !== undefined && (
          <ScoreBar
            label={SCORE_CONFIG.company_connection.label}
            value={scores.company_connection}
            color={SCORE_CONFIG.company_connection.color}
          />
        )}
        <ScoreBar
          label={SCORE_CONFIG.readability.label}
          value={scores.readability}
          color={SCORE_CONFIG.readability.color}
        />
      </div>

      {/* Note when company RAG not available */}
      {!hasCompanyRag && (
        <p className="text-xs text-muted-foreground italic">
          ※ 企業情報を取得すると「企業接続」評価も表示されます
        </p>
      )}
    </div>
  );
}
