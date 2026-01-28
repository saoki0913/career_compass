"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RewriteDisplayProps {
  rewrites: string[];
  onApply: (rewrite: string, index: number) => void;
  className?: string;
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
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const STYLE_LABELS = ["バランス", "堅め", "個性強め"];

export function RewriteDisplay({ rewrites, onApply, className }: RewriteDisplayProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <ApplyIcon />
        </span>
        リライト候補
      </h4>

      {/* Tabs */}
      {rewrites.length > 1 && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {rewrites.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveTab(index)}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === index
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {STYLE_LABELS[index] || `候補${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Rewrite Content */}
      <div className="relative">
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {rewrites[activeTab]}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopy(rewrites[activeTab], activeTab)}
            className="flex-1"
          >
            {copiedIndex === activeTab ? (
              <>
                <CheckIcon />
                コピーしました
              </>
            ) : (
              <>
                <CopyIcon />
                コピー
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(rewrites[activeTab], activeTab)}
            className="flex-1"
          >
            <ApplyIcon />
            反映する
          </Button>
        </div>
      </div>

      {/* Info */}
      <p className="text-xs text-muted-foreground">
        ※「反映する」をクリックすると、現在の選択範囲または全文を置き換えます
      </p>
    </div>
  );
}
