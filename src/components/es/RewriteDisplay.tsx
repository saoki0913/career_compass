"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RewriteDisplayProps {
  rewrites: string[];
  onApply: (rewrite: string, index: number) => void;
  originalText?: string;
  charLimit?: number;
  className?: string;
  layout?: "grid" | "stack" | "tabs";
  onOpenFullscreen?: () => void;
  onOpenCompare?: () => void;
}

// Icons
const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ApplyIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const ExpandIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
    />
  </svg>
);

const CompareIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
    />
  </svg>
);

const STYLE_CONFIG = [
  { label: "バランス", description: "読みやすさと説得力を両立", icon: "⚖️" },
  { label: "堅め", description: "フォーマルで丁寧な表現", icon: "📋" },
  { label: "個性強め", description: "印象に残る独自性重視", icon: "✨" },
];

// Preview length for sidebar display
const PREVIEW_LENGTH = 150;

interface CharacterStatsProps {
  charCount: number;
  originalLength: number;
  charLimit?: number;
}

function CharacterStats({ charCount, originalLength, charLimit }: CharacterStatsProps) {
  const charDiff = charCount - originalLength;
  const diffPercent = originalLength > 0 ? Math.round((charDiff / originalLength) * 100) : 0;
  const isOverLimit = charLimit && charCount > charLimit;

  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className={cn(
          "tabular-nums font-medium",
          isOverLimit ? "text-red-500" : "text-muted-foreground"
        )}
      >
        {charCount}字
        {charLimit && (
          <span className={isOverLimit ? "text-red-500" : "text-muted-foreground/60"}>
            {" / "}{charLimit}
          </span>
        )}
        {isOverLimit && <span className="ml-1 text-red-500">超過</span>}
      </span>
      <span
        className={cn(
          "tabular-nums",
          charDiff > 0 ? "text-amber-600" : charDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
        )}
      >
        {charDiff > 0 ? "+" : ""}{charDiff}字
        <span className="text-muted-foreground/60 ml-1">
          ({diffPercent > 0 ? "+" : ""}{diffPercent}%)
        </span>
      </span>
    </div>
  );
}

// Tab-based rewrite display for sidebar (main new component)
export function RewriteDisplay({
  rewrites,
  onApply,
  originalText,
  charLimit,
  className,
  layout = "tabs",
  onOpenFullscreen,
  onOpenCompare,
}: RewriteDisplayProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const originalLength = originalText?.length || 0;

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (rewrites.length === 0) {
    return (
      <div className={cn("text-center py-4 text-muted-foreground", className)}>
        リライト候補がありません
      </div>
    );
  }

  const currentRewrite = rewrites[activeTab] || rewrites[0];
  const currentStyle = STYLE_CONFIG[activeTab] || STYLE_CONFIG[0];
  const charCount = currentRewrite.length;

  // For stack layout (fullscreen mode), show all rewrites vertically
  if (layout === "stack") {
    return (
      <div className={cn("space-y-4", className)}>
        {rewrites.map((rewrite, index) => {
          const style = STYLE_CONFIG[index] || { label: `候補${index + 1}`, description: "", icon: "📝" };
          const count = rewrite.length;

          return (
            <div
              key={index}
              className="rounded-lg border bg-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{style.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{style.label}</p>
                    <p className="text-xs text-muted-foreground">{style.description}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{rewrite}</p>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 bg-muted/30 border-t space-y-3">
                <CharacterStats
                  charCount={count}
                  originalLength={originalLength}
                  charLimit={charLimit}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(rewrite, index)}
                    className="flex-1"
                  >
                    {copiedIndex === index ? (
                      <>
                        <CheckIcon />
                        <span className="ml-1">完了</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon />
                        <span className="ml-1">コピー</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onApply(rewrite, index)}
                    className="flex-1"
                  >
                    <ApplyIcon />
                    <span className="ml-1">反映</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Default: Tab-based display for sidebar
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with title */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <ApplyIcon />
          </span>
          <h4 className="text-sm font-semibold">リライト候補</h4>
          <span className="text-xs text-muted-foreground">
            ({rewrites.length}パターン)
          </span>
        </div>
      </div>

      {/* Style tabs */}
      <div className="flex rounded-lg bg-muted p-1 gap-1">
        {rewrites.map((_, index) => {
          const style = STYLE_CONFIG[index] || { label: `候補${index + 1}`, icon: "📝" };
          const isActive = activeTab === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => setActiveTab(index)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-md transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{style.icon}</span>
              <span className="hidden sm:inline">{style.label}</span>
            </button>
          );
        })}
      </div>

      {/* Current style description */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-base">{currentStyle.icon}</span>
        <span>{currentStyle.description}</span>
      </div>

      {/* Preview content */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {currentRewrite.length > PREVIEW_LENGTH
            ? `${currentRewrite.substring(0, PREVIEW_LENGTH)}...`
            : currentRewrite}
        </p>
      </div>

      {/* Character stats */}
      <CharacterStats
        charCount={charCount}
        originalLength={originalLength}
        charLimit={charLimit}
      />

      {/* Action buttons - Primary actions for fullscreen/compare */}
      <div className="flex gap-2">
        {onOpenFullscreen && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenFullscreen}
            className="flex-1 gap-1.5"
          >
            <ExpandIcon />
            全文を見る
          </Button>
        )}
        {onOpenCompare && originalText && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenCompare}
            className="flex-1 gap-1.5"
          >
            <CompareIcon />
            原文と比較
          </Button>
        )}
      </div>

      {/* Secondary actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCopy(currentRewrite, activeTab)}
          className="flex-1 h-8 text-xs"
        >
          {copiedIndex === activeTab ? (
            <>
              <CheckIcon />
              <span className="ml-1">完了</span>
            </>
          ) : (
            <>
              <CopyIcon />
              <span className="ml-1">コピー</span>
            </>
          )}
        </Button>
        <Button
          size="sm"
          onClick={() => onApply(currentRewrite, activeTab)}
          className="flex-1 h-8 text-xs"
        >
          <ApplyIcon />
          <span className="ml-1">反映</span>
        </Button>
      </div>

      {/* Info */}
      <p className="text-[10px] text-muted-foreground">
        ※「反映」で現在の選択範囲または全文を置き換えます
      </p>
    </div>
  );
}

// Grid layout for legacy support
export function RewriteGrid({
  rewrites,
  onApply,
  originalText,
  charLimit,
  className,
  onOpenFullscreen,
}: RewriteDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const originalLength = originalText?.length || 0;

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (rewrites.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
            <ApplyIcon />
          </span>
          <h4 className="text-sm font-semibold">リライト候補</h4>
          <span className="text-xs text-muted-foreground">
            ({rewrites.length}パターン)
          </span>
        </div>
        {onOpenFullscreen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFullscreen}
            className="h-7 px-2 text-xs"
          >
            全画面で表示
          </Button>
        )}
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        {rewrites.map((rewrite, index) => {
          const style = STYLE_CONFIG[index] || { label: `候補${index + 1}`, description: "", icon: "📝" };
          const charCount = rewrite.length;
          const charDiff = charCount - originalLength;
          const diffPercent = originalLength > 0 ? Math.round((charDiff / originalLength) * 100) : 0;
          const isOverLimit = charLimit && charCount > charLimit;

          return (
            <div
              key={index}
              className="flex flex-col rounded-lg border bg-card overflow-hidden transition-all hover:border-primary/50 h-full"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-base">{style.icon}</span>
                  <div>
                    <p className="text-xs font-semibold">{style.label}</p>
                    <p className="text-[10px] text-muted-foreground">{style.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-3 overflow-y-auto">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{rewrite}</p>
              </div>

              <div className="px-3 py-2 bg-muted/30 border-t space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={cn(
                      "tabular-nums",
                      isOverLimit ? "text-red-500 font-medium" : "text-muted-foreground"
                    )}
                  >
                    {charCount}字
                    {charLimit && (
                      <span className={isOverLimit ? "text-red-500" : "text-muted-foreground/60"}>
                        {" / "}{charLimit}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      charDiff > 0 ? "text-amber-600" : charDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
                    )}
                  >
                    {charDiff > 0 ? "+" : ""}{charDiff}字
                    <span className="text-muted-foreground/60 ml-1">
                      ({diffPercent > 0 ? "+" : ""}{diffPercent}%)
                    </span>
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(rewrite, index)}
                    className="flex-1 h-8 text-xs"
                  >
                    {copiedIndex === index ? (
                      <>
                        <CheckIcon />
                        <span className="ml-1">完了</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon />
                        <span className="ml-1">コピー</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onApply(rewrite, index)}
                    className="flex-1 h-8 text-xs"
                  >
                    <ApplyIcon />
                    <span className="ml-1">反映</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact version for mobile carousel
export function RewriteCarousel({
  rewrites,
  onApply,
  originalText,
  charLimit,
  className,
}: RewriteDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const originalLength = originalText?.length || 0;

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (rewrites.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide">
        {rewrites.map((rewrite, index) => {
          const style = STYLE_CONFIG[index] || { label: `候補${index + 1}`, description: "", icon: "📝" };
          const charCount = rewrite.length;
          const charDiff = charCount - originalLength;
          const diffPercent = originalLength > 0 ? Math.round((charDiff / originalLength) * 100) : 0;
          const isOverLimit = charLimit && charCount > charLimit;

          return (
            <div
              key={index}
              className="snap-center shrink-0 w-[85vw] max-w-sm"
            >
              <div className="flex flex-col rounded-lg border bg-card overflow-hidden h-auto">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{style.icon}</span>
                    <p className="text-xs font-semibold">{style.label}</p>
                  </div>
                </div>

                <div className="p-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{rewrite}</p>
                </div>

                <div className="px-3 py-2 bg-muted/30 border-t space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "tabular-nums",
                        isOverLimit ? "text-red-500 font-medium" : "text-muted-foreground"
                      )}
                    >
                      {charCount}字
                      {charLimit && ` / ${charLimit}`}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        charDiff > 0 ? "text-amber-600" : charDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
                      )}
                    >
                      {charDiff > 0 ? "+" : ""}{charDiff}字 ({diffPercent > 0 ? "+" : ""}{diffPercent}%)
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(rewrite, index)}
                      className="flex-1 h-8 text-xs"
                    >
                      {copiedIndex === index ? (
                        <>
                          <CheckIcon />
                          <span className="ml-1">完了</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon />
                          <span className="ml-1">コピー</span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onApply(rewrite, index)}
                      className="flex-1 h-8 text-xs"
                    >
                      <ApplyIcon />
                      <span className="ml-1">反映</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-1.5">
        {rewrites.map((_, index) => (
          <div
            key={index}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
          />
        ))}
      </div>
    </div>
  );
}
