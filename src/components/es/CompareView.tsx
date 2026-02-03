"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const STYLE_CONFIG = [
  { label: "バランス", description: "読みやすさと説得力を両立", icon: "⚖️" },
  { label: "堅め", description: "フォーマルで丁寧な表現", icon: "📋" },
  { label: "個性強め", description: "印象に残る独自性重視", icon: "✨" },
];

interface CompareViewProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  rewrites: string[];
  charLimit?: number;
  onApply: (rewrite: string, index: number) => void;
}

// Simple diff algorithm to highlight changes
function computeDiff(original: string, modified: string): { type: "same" | "added" | "removed"; text: string }[] {
  // Simple word-based diff for Japanese text (split by characters for better granularity)
  const originalChars = original.split("");
  const modifiedChars = modified.split("");

  // LCS-based diff (simplified)
  const result: { type: "same" | "added" | "removed"; text: string }[] = [];

  let i = 0;
  let j = 0;

  while (i < originalChars.length || j < modifiedChars.length) {
    if (i >= originalChars.length) {
      // Rest is added
      result.push({ type: "added", text: modifiedChars.slice(j).join("") });
      break;
    }
    if (j >= modifiedChars.length) {
      // Rest is removed
      result.push({ type: "removed", text: originalChars.slice(i).join("") });
      break;
    }

    if (originalChars[i] === modifiedChars[j]) {
      // Same character
      let sameText = "";
      while (i < originalChars.length && j < modifiedChars.length && originalChars[i] === modifiedChars[j]) {
        sameText += originalChars[i];
        i++;
        j++;
      }
      if (sameText) {
        result.push({ type: "same", text: sameText });
      }
    } else {
      // Find next matching point
      let foundMatch = false;

      // Look ahead in modified for match with original[i]
      for (let k = j + 1; k < Math.min(j + 20, modifiedChars.length); k++) {
        if (modifiedChars[k] === originalChars[i]) {
          // Added text
          result.push({ type: "added", text: modifiedChars.slice(j, k).join("") });
          j = k;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // Look ahead in original for match with modified[j]
        for (let k = i + 1; k < Math.min(i + 20, originalChars.length); k++) {
          if (originalChars[k] === modifiedChars[j]) {
            // Removed text
            result.push({ type: "removed", text: originalChars.slice(i, k).join("") });
            i = k;
            foundMatch = true;
            break;
          }
        }
      }

      if (!foundMatch) {
        // No match found, treat as replacement
        result.push({ type: "removed", text: originalChars[i] });
        result.push({ type: "added", text: modifiedChars[j] });
        i++;
        j++;
      }
    }
  }

  // Merge consecutive same-type segments
  const merged: { type: "same" | "added" | "removed"; text: string }[] = [];
  for (const segment of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === segment.type) {
      merged[merged.length - 1].text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

// Render diff with highlighting
function DiffRenderer({ diff }: { diff: { type: "same" | "added" | "removed"; text: string }[] }) {
  return (
    <span>
      {diff.map((segment, index) => {
        if (segment.type === "same") {
          return <span key={index}>{segment.text}</span>;
        }
        if (segment.type === "added") {
          return (
            <span
              key={index}
              className="bg-emerald-100 text-emerald-800 px-0.5 rounded"
            >
              {segment.text}
            </span>
          );
        }
        if (segment.type === "removed") {
          return (
            <span
              key={index}
              className="bg-red-100 text-red-800 line-through px-0.5 rounded"
            >
              {segment.text}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}

export function CompareView({
  isOpen,
  onClose,
  originalText,
  rewrites,
  charLimit,
  onApply,
}: CompareViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const currentRewrite = rewrites[activeTab] || rewrites[0];
  const currentStyle = STYLE_CONFIG[activeTab] || STYLE_CONFIG[0];

  const originalLength = originalText.length;
  const rewriteLength = currentRewrite.length;
  const charDiff = rewriteLength - originalLength;
  const diffPercent = originalLength > 0 ? Math.round((charDiff / originalLength) * 100) : 0;
  const isOverLimit = charLimit && rewriteLength > charLimit;

  // Compute diff for current rewrite
  const diff = useMemo(() => {
    if (!showDiff) return null;
    return computeDiff(originalText, currentRewrite);
  }, [originalText, currentRewrite, showDiff]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentRewrite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleApply = () => {
    onApply(currentRewrite, activeTab);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              リライト比較
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <CloseIcon />
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex rounded-lg bg-muted p-1 gap-1 w-fit">
            {rewrites.map((_, index) => {
              const style = STYLE_CONFIG[index] || { label: `候補${index + 1}`, icon: "📝" };
              const isActive = activeTab === index;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveTab(index)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-lg">{style.icon}</span>
                  <span>{style.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {currentStyle.icon} {currentStyle.description}
          </p>
        </div>

        {/* Comparison content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Original */}
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 bg-muted/50 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">原文</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({originalLength}字)
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {originalText}
                </p>
              </div>
            </div>

            {/* Rewrite */}
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 bg-primary/5 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">リライト</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      isOverLimit ? "text-red-500" : "text-muted-foreground"
                    )}
                  >
                    ({rewriteLength}字
                    {charLimit && <span> / {charLimit}</span>})
                  </span>
                  <span
                    className={cn(
                      "text-xs tabular-nums font-medium",
                      charDiff > 0 ? "text-amber-600" : charDiff < 0 ? "text-emerald-600" : "text-muted-foreground"
                    )}
                  >
                    {charDiff > 0 ? "+" : ""}{charDiff}字
                    ({diffPercent > 0 ? "+" : ""}{diffPercent}%)
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-muted-foreground">差分表示</span>
                </label>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {showDiff && diff ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    <DiffRenderer diff={diff} />
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {currentRewrite}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Character limit warning */}
        {isOverLimit && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-200 shrink-0">
            <p className="text-xs text-red-600 font-medium">
              文字数制限を{rewriteLength - charLimit!}字超過しています
            </p>
          </div>
        )}

        {/* Diff legend */}
        {showDiff && (
          <div className="px-6 py-2 bg-muted/30 border-t flex items-center gap-4 text-xs shrink-0">
            <span className="text-muted-foreground">差分の見方:</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-emerald-100 rounded" />
              <span className="text-emerald-700">追加</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-red-100 rounded" />
              <span className="text-red-700 line-through">削除</span>
            </span>
          </div>
        )}

        {/* Footer actions */}
        <div className="px-6 py-4 border-t bg-background flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>タブを切り替えて他のパターンも確認できます</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy} className="gap-2">
              {copied ? (
                <>
                  <CheckIcon />
                  コピー完了
                </>
              ) : (
                <>
                  <CopyIcon />
                  コピー
                </>
              )}
            </Button>
            <Button onClick={handleApply} className="gap-2">
              <ApplyIcon />
              この内容を反映
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
