"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReviewEmptyStateProps {
  onStartFullReview: () => void;
  hasContent: boolean;
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  availableStyles: string[];
  hasCompanyRag?: boolean;
  companyName?: string;
  companyId?: string;
  className?: string;
}

const SparkleIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const SparkleIconSmall = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const FEATURES_DEFAULT = [
  "5軸のスコア評価（論理性・具体性・熱意・企業接続・読みやすさ）",
  "具体的な改善ポイントと優先度",
  "3パターンのリライト候補",
];

function getCompanyFeatures(companyName: string) {
  return [
    "企業情報をもとにした5軸スコア評価",
    `${companyName}に響く改善ポイントと優先度`,
    "企業の特徴を反映した3パターンのリライト候補",
  ];
}

export function ReviewEmptyState({
  onStartFullReview,
  hasContent,
  selectedStyle,
  onStyleChange,
  availableStyles,
  hasCompanyRag = false,
  companyName,
  companyId,
  className,
}: ReviewEmptyStateProps) {
  const features = hasCompanyRag && companyName
    ? getCompanyFeatures(companyName)
    : FEATURES_DEFAULT;

  return (
    <div className={cn("flex flex-col items-center text-center py-6 px-2 space-y-5", className)}>
      {/* Hero icon */}
      <div className="relative">
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center",
          hasCompanyRag
            ? "bg-gradient-to-br from-emerald-500/20 to-primary/10"
            : "bg-gradient-to-br from-primary/20 to-primary/5"
        )}>
          <span className="text-primary">
            <SparkleIcon />
          </span>
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary/30 animate-pulse" />
        <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-primary/20 animate-pulse [animation-delay:500ms]" />
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">
          {hasCompanyRag && companyName
            ? `${companyName}に特化したAI添削`
            : "ESをAIが添削します"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
          {hasCompanyRag
            ? "企業のIR資料・採用ページ・プレスリリースなどの情報をもとに、この企業に合った改善ポイントとリライトを提案します"
            : "AIがあなたのESを分析し、改善ポイントとリライト候補を提案します"}
        </p>
      </div>

      {/* Company RAG badge */}
      {hasCompanyRag && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
          <BuildingIcon />
          <span className="text-xs font-medium">企業情報取得済み</span>
        </div>
      )}

      {/* Feature list */}
      <div className="w-full space-y-2 text-left px-1">
        {features.map((feature, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              hasCompanyRag
                ? "bg-emerald-100 text-emerald-600"
                : "bg-primary/10 text-primary"
            )}>
              <CheckIcon />
            </span>
            <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
          </div>
        ))}
      </div>

      {/* Company RAG promotion banner (when RAG is NOT available) */}
      {!hasCompanyRag && companyId && (
        <div className="w-full p-3 bg-amber-50 border border-amber-200 rounded-lg text-left space-y-2">
          <p className="text-xs text-amber-800 leading-relaxed">
            企業情報を取得すると、その企業に特化した添削が可能になります
          </p>
          <Button variant="outline" size="sm" asChild className="border-amber-300 text-amber-800 hover:bg-amber-100">
            <Link href={`/companies/${companyId}`}>
              <BuildingIcon />
              企業情報を取得する
            </Link>
          </Button>
        </div>
      )}

      {/* Usage guide */}
      <div className="w-full p-3 bg-muted/50 rounded-lg border border-border/50 text-left">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">使い方: </span>
          左エディターの設問見出し下にある「AI添削する」バーをクリックすると、設問単位で添削できます
        </p>
      </div>

      {/* Full review CTA */}
      <div className="w-full space-y-2">
        <Button
          onClick={onStartFullReview}
          className="w-full"
          disabled={!hasContent}
        >
          <SparkleIconSmall />
          ES全体を添削する
        </Button>
        {!hasContent && (
          <p className="text-xs text-muted-foreground">
            10文字以上入力してから添削を実行してください
          </p>
        )}
      </div>

      {/* Advanced settings (collapsible) */}
      <details className="w-full text-left group/details">
        <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
          <span className="transition-transform group-open/details:rotate-180">
            <ChevronDownIcon />
          </span>
          詳細設定
        </summary>
        <div className="mt-3 space-y-2">
          <label className="text-xs font-medium text-muted-foreground block">
            リライトスタイル
          </label>
          <div className="relative">
            <select
              value={selectedStyle}
              onChange={(e) => onStyleChange(e.target.value)}
              className="w-full px-3 py-2 border border-border/60 rounded-lg text-sm bg-background hover:bg-muted/50 hover:border-border transition-all duration-200 cursor-pointer appearance-none"
            >
              {availableStyles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <ChevronDownIcon />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
