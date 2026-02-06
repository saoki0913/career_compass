"use client";

import { cn } from "@/lib/utils";
import type { ReviewScores } from "@/hooks/useESReview";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";

// Score axis explanations for UX clarity
const SCORE_EXPLANATIONS = {
  logic: {
    title: "論理性",
    description: "主張と根拠の整合性、因果関係の明確さ",
    goodExample: "結論→理由→具体例の流れが明確",
    icon: "🔗",
  },
  specificity: {
    title: "具体性",
    description: "数値、固有名詞、具体的エピソードの有無",
    goodExample: "「3ヶ月で売上20%向上」のような記述",
    icon: "🎯",
  },
  passion: {
    title: "熱意",
    description: "志望度の強さ、入社意欲が伝わる表現",
    goodExample: "「御社でしか実現できない」という意志",
    icon: "🔥",
  },
  company_connection: {
    title: "企業接続",
    description: "企業研究に基づく具体的な接続の有無",
    goodExample: "事業・理念と経験を結びつけた記述",
    icon: "🏢",
  },
  readability: {
    title: "読みやすさ",
    description: "文の長さ、段落構成、接続詞の適切さ",
    goodExample: "一文60字以内、適切な段落分け",
    icon: "📖",
  },
} as const;

// Grade threshold explanations
const GRADE_THRESHOLDS = [
  { grade: "A+", min: 4.5, label: "このまま提出可能", color: "text-emerald-600" },
  { grade: "A", min: 4.0, label: "微調整で完成", color: "text-emerald-500" },
  { grade: "B+", min: 3.5, label: "いくつかの改善で向上", color: "text-blue-500" },
  { grade: "B", min: 3.0, label: "重点的な改善が必要", color: "text-amber-500" },
  { grade: "C", min: 0, label: "大幅な見直しが必要", color: "text-red-500" },
] as const;

interface ScoreDisplayProps {
  scores: ReviewScores;
  hasCompanyRag: boolean;
  className?: string;
  onScrollToIssue?: (category: string) => void;
}

interface ScoreBarProps {
  scoreKey: keyof typeof SCORE_EXPLANATIONS;
  value: number;
  color: string;
  onScrollToIssue?: (category: string) => void;
}

// Info icon component
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-3.5 h-3.5", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ScoreBar({ scoreKey, value, color, onScrollToIssue }: ScoreBarProps) {
  const percentage = (value / 5) * 100;
  const explanation = SCORE_EXPLANATIONS[scoreKey];
  const isLowScore = value < 3;

  return (
    <div className="flex items-center gap-2">
      {/* Label with popover tooltip */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground w-20 shrink-0 hover:text-foreground transition-colors group"
          >
            <span>{explanation.title}</span>
            <InfoIcon className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-64">
          <PopoverHeader>
            <PopoverTitle className="flex items-center gap-2">
              <span>{explanation.icon}</span>
              <span>{explanation.title}</span>
            </PopoverTitle>
            <PopoverDescription className="mt-1">
              {explanation.description}
            </PopoverDescription>
          </PopoverHeader>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">良い例:</p>
            <p className="text-xs mt-1 text-foreground/80">{explanation.goodExample}</p>
          </div>
        </PopoverContent>
      </Popover>

      {/* Progress bar */}
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Score value */}
      <span
        className={cn(
          "text-xs font-bold w-6 text-right tabular-nums",
          isLowScore && "text-amber-600"
        )}
      >
        {value}
      </span>

      {/* Low score link to improvements */}
      {isLowScore && onScrollToIssue && (
        <button
          type="button"
          onClick={() => onScrollToIssue(scoreKey)}
          className="text-[10px] text-amber-600 hover:text-amber-700 underline underline-offset-2 shrink-0"
        >
          改善点→
        </button>
      )}
    </div>
  );
}

// Grade explanation popover
function GradeExplanation({
  currentGrade,
  average,
}: {
  currentGrade: string;
  average: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>評価基準</span>
          <InfoIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-56">
        <PopoverHeader>
          <PopoverTitle>グレード基準</PopoverTitle>
        </PopoverHeader>
        <div className="mt-3 space-y-2">
          {GRADE_THRESHOLDS.map((threshold) => (
            <div
              key={threshold.grade}
              className={cn(
                "flex items-center justify-between text-xs py-1 px-2 rounded",
                currentGrade === threshold.grade && "bg-muted"
              )}
            >
              <span className={cn("font-bold", threshold.color)}>
                {threshold.grade}
              </span>
              <span className="text-muted-foreground">
                {threshold.min > 0 ? `${threshold.min}+` : `<${GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 2].min}`}
              </span>
              <span className="text-foreground/80">{threshold.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            現在のスコア: <span className="font-medium text-foreground">{average.toFixed(1)}</span>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SCORE_CONFIG: Record<keyof ReviewScores, { color: string }> = {
  logic: { color: "bg-primary" },
  specificity: { color: "bg-primary" },
  passion: { color: "bg-primary" },
  company_connection: { color: "bg-primary" },
  readability: { color: "bg-primary" },
};

export function ScoreDisplay({
  scores,
  hasCompanyRag,
  className,
  onScrollToIssue,
}: ScoreDisplayProps) {
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

  const currentGrade = getGradeLabel(average);

  // Count low scores for summary
  const lowScoreCount = scoreValues.filter((v) => v < 3).length;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Overall Grade - Compact single line */}
      <div className="flex items-center justify-between pb-1.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={cn("text-xl font-bold", getGradeColor(average))}>
            {currentGrade}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{average.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/ 5.0</span>
          </div>
          {lowScoreCount > 0 && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {lowScoreCount}項目要改善
            </span>
          )}
        </div>
        <GradeExplanation currentGrade={currentGrade} average={average} />
      </div>

      {/* Individual Scores */}
      <div className="space-y-1.5">
        <ScoreBar
          scoreKey="logic"
          value={scores.logic}
          color={SCORE_CONFIG.logic.color}
          onScrollToIssue={onScrollToIssue}
        />
        <ScoreBar
          scoreKey="specificity"
          value={scores.specificity}
          color={SCORE_CONFIG.specificity.color}
          onScrollToIssue={onScrollToIssue}
        />
        <ScoreBar
          scoreKey="passion"
          value={scores.passion}
          color={SCORE_CONFIG.passion.color}
          onScrollToIssue={onScrollToIssue}
        />
        {hasCompanyRag && scores.company_connection !== undefined && (
          <ScoreBar
            scoreKey="company_connection"
            value={scores.company_connection}
            color={SCORE_CONFIG.company_connection.color}
            onScrollToIssue={onScrollToIssue}
          />
        )}
        <ScoreBar
          scoreKey="readability"
          value={scores.readability}
          color={SCORE_CONFIG.readability.color}
          onScrollToIssue={onScrollToIssue}
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
