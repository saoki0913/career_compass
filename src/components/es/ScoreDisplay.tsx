"use client";

import { cn } from "@/lib/utils";
import type { ReviewScores } from "@/hooks/useESReview";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

const SCORE_EXPLANATIONS = {
  logic: {
    title: "論理性",
    description: "主張と根拠のつながりが自然か",
    goodExample: "結論から入り、理由と具体例が素直につながっている状態",
    icon: "L",
  },
  specificity: {
    title: "具体性",
    description: "状況や行動が具体的に見えるか",
    goodExample: "経験の場面や役割が読み手に伝わる状態",
    icon: "S",
  },
  passion: {
    title: "熱意",
    description: "志望度や意欲が伝わるか",
    goodExample: "なぜ取り組みたいかが自分の言葉で示されている状態",
    icon: "P",
  },
  company_connection: {
    title: "企業接続",
    description: "企業情報と自分の経験が結びついているか",
    goodExample: "事業や価値観との接点が具体的に書かれている状態",
    icon: "C",
  },
  readability: {
    title: "読みやすさ",
    description: "文の長さや流れが読みやすいか",
    goodExample: "一文が重すぎず、読み進めやすい状態",
    icon: "R",
  },
} as const;

const GRADE_THRESHOLDS = [
  { grade: "S", min: 4.6, label: "かなり完成度が高い", color: "text-emerald-600" },
  { grade: "A", min: 4.1, label: "十分に強い内容", color: "text-emerald-500" },
  { grade: "B", min: 3.5, label: "通過水準に近い", color: "text-blue-600" },
  { grade: "C", min: 2.8, label: "伸ばしどころがある", color: "text-amber-600" },
  { grade: "D", min: 0, label: "構成から見直したい", color: "text-red-600" },
] as const;

interface ScoreDisplayProps {
  scores: ReviewScores;
  hasCompanyRag: boolean;
  className?: string;
}

interface ScoreSummary {
  average: number;
  grade: string;
  gradeColor: string;
  label: string;
  lowScoreCount: number;
}

function getVisibleScores(scores: ReviewScores, hasCompanyRag: boolean) {
  return Object.entries(scores)
    .filter(([key, value]) => (key !== "company_connection" || hasCompanyRag) && typeof value === "number")
    .map(([key, value]) => [key, value as number] as const);
}

export function getScoreSummary(scores: ReviewScores, hasCompanyRag: boolean): ScoreSummary {
  const entries = getVisibleScores(scores, hasCompanyRag);
  const values = entries.map(([, value]) => value);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const threshold = GRADE_THRESHOLDS.find((item) => average >= item.min) ?? GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];

  return {
    average,
    grade: threshold.grade,
    gradeColor: threshold.color,
    label: threshold.label,
    lowScoreCount: values.filter((value) => value < 3.2).length,
  };
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-3.5 w-3.5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function AxisHelp({ scoreKey }: { scoreKey: keyof typeof SCORE_EXPLANATIONS }) {
  const explanation = SCORE_EXPLANATIONS[scoreKey];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <span>{explanation.title}</span>
          <InfoIcon className="text-muted-foreground/70" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
              {explanation.icon}
            </span>
            <span>{explanation.title}</span>
          </PopoverTitle>
          <PopoverDescription>{explanation.description}</PopoverDescription>
        </PopoverHeader>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">良い状態: {explanation.goodExample}</p>
      </PopoverContent>
    </Popover>
  );
}

function ScoreBar({ scoreKey, value }: { scoreKey: keyof typeof SCORE_EXPLANATIONS; value: number }) {
  const percentage = Math.max(0, Math.min(100, (value / 5) * 100));
  const color = value >= 4.2 ? "bg-emerald-500" : value >= 3.5 ? "bg-blue-500" : value >= 2.8 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0">
        <AxisHelp scoreKey={scoreKey} />
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-300", color)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-9 text-right text-sm font-semibold tabular-nums text-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

function GradeHelp({ summary }: { summary: ScoreSummary }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <span>評価基準</span>
          <InfoIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>評価の見方</PopoverTitle>
          <PopoverDescription>良い回答でも改善余地は出る前提で、実務的に見ています。</PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-2 text-xs">
          {GRADE_THRESHOLDS.map((threshold) => (
            <div key={threshold.grade} className={cn("flex items-center justify-between rounded px-2 py-1", threshold.grade === summary.grade && "bg-muted")}>
              <span className={cn("font-bold", threshold.color)}>{threshold.grade}</span>
              <span className="text-muted-foreground">{threshold.min > 0 ? `${threshold.min.toFixed(1)}+` : "-"}</span>
              <span className="text-foreground/85">{threshold.label}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ScoreDisplay({ scores, hasCompanyRag, className }: ScoreDisplayProps) {
  const summary = getScoreSummary(scores, hasCompanyRag);
  const visibleScores = getVisibleScores(scores, hasCompanyRag) as Array<[keyof typeof SCORE_EXPLANATIONS, number]>;

  return (
    <div className={cn("space-y-3 rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-bold", summary.gradeColor)}>{summary.grade}</span>
            <span className="text-base font-semibold text-foreground">{summary.average.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/ 5.0</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{summary.label}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <GradeHelp summary={summary} />
          {summary.lowScoreCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
              要調整 {summary.lowScoreCount}項目
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleScores.map(([key, value]) => (
          <ScoreBar key={key} scoreKey={key} value={value} />
        ))}
      </div>

      {!hasCompanyRag && (
        <p className="text-xs text-muted-foreground">企業情報があると、企業接続も含めて評価されます。</p>
      )}
    </div>
  );
}
