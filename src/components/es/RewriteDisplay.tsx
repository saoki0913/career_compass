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
  layout?: "grid" | "stack";
  onOpenFullscreen?: () => void;
}

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

const STYLE_CONFIG = [
  { label: "バランス", description: "読みやすさと説得力を両立", icon: "⚖️" },
  { label: "堅め", description: "フォーマルで丁寧な表現", icon: "📋" },
  { label: "個性強め", description: "印象に残る独自性重視", icon: "✨" },
];

interface RewriteCardProps {
  rewrite: string;
  styleIndex: number;
  originalLength: number;
  charLimit?: number;
  onCopy: () => void;
  onApply: () => void;
  isCopied: boolean;
  isCompact?: boolean;
}

function RewriteCard({
  rewrite,
  styleIndex,
  originalLength,
  charLimit,
  onCopy,
  onApply,
  isCopied,
  isCompact,
}: RewriteCardProps) {
  const style = STYLE_CONFIG[styleIndex] || { label: `候補${styleIndex + 1}`, description: "", icon: "📝" };
  const charCount = rewrite.length;
  const charDiff = charCount - originalLength;
  const diffPercent = originalLength > 0 ? Math.round((charDiff / originalLength) * 100) : 0;
  const isOverLimit = charLimit && charCount > charLimit;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card overflow-hidden transition-all hover:border-primary/50",
        isCompact ? "h-auto" : "h-full"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-base">{style.icon}</span>
          <div>
            <p className="text-xs font-semibold">{style.label}</p>
            {!isCompact && (
              <p className="text-[10px] text-muted-foreground">{style.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{rewrite}</p>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-muted/30 border-t space-y-2">
        {/* Stats */}
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

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="flex-1 h-8 text-xs"
          >
            {isCopied ? (
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
            onClick={onApply}
            className="flex-1 h-8 text-xs"
          >
            <ApplyIcon />
            <span className="ml-1">反映</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// Collapsible original text section
function OriginalTextSection({
  text,
  isExpanded,
  onToggle,
}: {
  text: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-xs font-medium text-muted-foreground">
          原文 ({text.length}字)
        </span>
        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3">
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

export function RewriteDisplay({
  rewrites,
  onApply,
  originalText,
  charLimit,
  className,
  layout = "grid",
  onOpenFullscreen,
}: RewriteDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
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

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
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

      {/* Original text (collapsible) */}
      {originalText && (
        <OriginalTextSection
          text={originalText}
          isExpanded={showOriginal}
          onToggle={() => setShowOriginal(!showOriginal)}
        />
      )}

      {/* Grid of rewrite cards - responsive */}
      <div
        className={cn(
          "grid gap-3",
          layout === "stack" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"
        )}
      >
        {rewrites.map((rewrite, index) => (
          <RewriteCard
            key={index}
            rewrite={rewrite}
            styleIndex={index}
            originalLength={originalLength}
            charLimit={charLimit}
            onCopy={() => handleCopy(rewrite, index)}
            onApply={() => onApply(rewrite, index)}
            isCopied={copiedIndex === index}
          />
        ))}
      </div>

      {/* Mobile: horizontal scroll hint */}
      <div className="md:hidden">
        <p className="text-[10px] text-muted-foreground text-center">
          下にスクロールして他の候補を表示
        </p>
      </div>

      {/* Info */}
      <p className="text-xs text-muted-foreground">
        ※「反映」をクリックすると、現在の選択範囲または全文を置き換えます
      </p>
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
      {/* Swipeable container with scroll-snap */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide">
        {rewrites.map((rewrite, index) => (
          <div
            key={index}
            className="snap-center shrink-0 w-[85vw] max-w-sm"
          >
            <RewriteCard
              rewrite={rewrite}
              styleIndex={index}
              originalLength={originalLength}
              charLimit={charLimit}
              onCopy={() => handleCopy(rewrite, index)}
              onApply={() => onApply(rewrite, index)}
              isCopied={copiedIndex === index}
              isCompact
            />
          </div>
        ))}
      </div>

      {/* Dots indicator */}
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
