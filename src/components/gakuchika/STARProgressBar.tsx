"use client";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";

interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

interface STARProgressBarProps {
  scores: STARScores | null;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}

const STAR_ELEMENTS = [
  { key: "situation", label: "状況" },
  { key: "task", label: "課題" },
  { key: "action", label: "行動" },
  { key: "result", label: "結果" },
] as const;

// STAR element explanations for tooltips
export const STAR_EXPLANATIONS = {
  situation: {
    title: "状況 (Situation)",
    description: "いつ、どこで、どんな環境で起きた出来事か",
    example: "例: 大学2年次、50人規模のサークルで副代表を務めていた時",
  },
  task: {
    title: "課題 (Task)",
    description: "その状況下でどんな問題や目標があったか",
    example: "例: 新入生の定着率が低く、入会後1ヶ月で30%が辞めていた",
  },
  action: {
    title: "行動 (Action)",
    description: "課題に対してあなたが実際に取った行動",
    example: "例: 退会理由をヒアリングし、メンター制度を立ち上げた",
  },
  result: {
    title: "結果 (Result)",
    description: "行動の結果、何が起きたか・何を学んだか",
    example: "例: 定着率が90%に向上。信頼関係構築の重要性を学んだ",
  },
} as const;

const COMPLETION_THRESHOLD = 70;

// New color scheme: gray (0%) -> blue (1-69%) -> green (70%+)
function getScoreColor(score: number): string {
  if (score >= COMPLETION_THRESHOLD) {
    return "bg-success";
  }
  if (score > 0) {
    return "bg-info";
  }
  return "bg-muted-foreground/30";
}

function getScoreColorClass(score: number): string {
  if (score >= COMPLETION_THRESHOLD) {
    return "text-success";
  }
  if (score > 0) {
    return "text-info";
  }
  return "text-muted-foreground";
}

function getBackgroundColor(score: number): string {
  if (score >= COMPLETION_THRESHOLD) {
    return "bg-success/10";
  }
  if (score > 0) {
    return "bg-info/10";
  }
  return "bg-muted";
}

export function STARProgressBar({
  scores,
  className,
  compact = false,
}: STARProgressBarProps) {
  const defaultScores: STARScores = {
    situation: 0,
    task: 0,
    action: 0,
    result: 0,
  };

  const currentScores = scores || defaultScores;
  const totalProgress = Math.round(
    (currentScores.situation +
      currentScores.task +
      currentScores.action +
      currentScores.result) /
      4
  );

  const isComplete = STAR_ELEMENTS.every(
    (el) => currentScores[el.key] >= COMPLETION_THRESHOLD
  );

  // Ultra compact version for list pages (just dots)
  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {STAR_ELEMENTS.map((element) => {
          const score = currentScores[element.key];
          return (
            <div
              key={element.key}
              className={cn(
                "relative h-1.5 w-5 rounded-full overflow-hidden transition-all duration-300",
                getBackgroundColor(score)
              )}
              title={`${element.label}: ${score}%`}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
                  getScoreColor(score)
                )}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
          );
        })}
        <span className="text-xs text-muted-foreground ml-0.5 tabular-nums">
          {totalProgress}%
        </span>
      </div>
    );
  }

  // Main compact inline version for conversation page
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        深掘り進捗
      </span>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        {STAR_ELEMENTS.map((element) => {
          const score = currentScores[element.key];
          const explanation = STAR_EXPLANATIONS[element.key];
          return (
            <div
              key={element.key}
              className="flex items-center gap-1 flex-1 min-w-0"
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground w-5 shrink-0 hover:text-foreground transition-colors cursor-help"
                  >
                    {element.label}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64">
                  <PopoverHeader>
                    <PopoverTitle className="text-sm">
                      {explanation.title}
                    </PopoverTitle>
                    <PopoverDescription className="mt-1">
                      {explanation.description}
                    </PopoverDescription>
                  </PopoverHeader>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-foreground/80">{explanation.example}</p>
                  </div>
                </PopoverContent>
              </Popover>
              <div
                className={cn(
                  "relative h-1.5 flex-1 min-w-0 rounded-full overflow-hidden",
                  getBackgroundColor(score)
                )}
              >
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
                    getScoreColor(score)
                  )}
                  style={{ width: `${Math.min(100, score)}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] tabular-nums w-6 text-right shrink-0",
                  getScoreColorClass(score)
                )}
              >
                {score}%
              </span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-success/10 text-success shrink-0">
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          完了
        </span>
      )}
    </div>
  );
}

// Compact version for list pages
export function STARProgressCompact({
  scores,
  className,
}: {
  scores: STARScores | null;
  className?: string;
}) {
  return <STARProgressBar scores={scores} compact className={className} />;
}

// Badge showing overall completion status
export function STARStatusBadge({
  scores,
  className,
}: {
  scores: STARScores | null;
  className?: string;
}) {
  if (!scores) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground",
          className
        )}
      >
        未開始
      </span>
    );
  }

  const isComplete = STAR_ELEMENTS.every(
    (el) => scores[el.key] >= COMPLETION_THRESHOLD
  );

  const totalProgress = Math.round(
    (scores.situation + scores.task + scores.action + scores.result) / 4
  );

  if (isComplete) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-success/10 text-success",
          className
        )}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        完了
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-info/10 text-info",
        className
      )}
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="10" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2} d="M12 6v6l3 3" />
      </svg>
      途中 ({totalProgress}%)
    </span>
  );
}

export { type STARScores };
