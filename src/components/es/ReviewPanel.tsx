"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useESReview, getAvailableStyles } from "@/hooks/useESReview";
import type { ReviewResult, SectionFeedback, SectionData } from "@/hooks/useESReview";
import { ScoreDisplay } from "./ScoreDisplay";
import { ImprovementList } from "./ImprovementList";
import { RewriteDisplay } from "./RewriteDisplay";
import { ReflectModal } from "./ReflectModal";

interface ReviewPanelProps {
  documentId: string;
  content: string;
  sections?: string[];
  sectionData?: SectionData[];  // Section data with character limits
  hasCompanyRag?: boolean;
  isPaid?: boolean;
  onApplyRewrite?: (newContent: string) => void;
  onUndo?: () => void;
  className?: string;
}

const SparkleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export function ReviewPanel({
  documentId,
  content,
  sections,
  sectionData,
  hasCompanyRag = false,
  isPaid = false,
  onApplyRewrite,
  onUndo,
  className,
}: ReviewPanelProps) {
  const [selectedStyle, setSelectedStyle] = useState("バランス");
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);

  const { review, isLoading, error, creditCost, requestReview, clearReview } = useESReview({
    documentId,
  });

  const availableStyles = getAvailableStyles(isPaid);

  const handleRequestReview = useCallback(async () => {
    await requestReview({
      content,
      style: selectedStyle,
      hasCompanyRag,
      sections: isPaid ? sections : undefined,
      sectionData: isPaid ? sectionData : undefined,
    });
  }, [content, selectedStyle, hasCompanyRag, sections, sectionData, isPaid, requestReview]);

  const handleApplyRewrite = useCallback(
    (rewriteText: string) => {
      setPendingRewrite(rewriteText);
      setShowReflectModal(true);
    },
    []
  );

  const handleConfirmReflect = useCallback(() => {
    if (pendingRewrite && onApplyRewrite) {
      onApplyRewrite(pendingRewrite);
    }
    setShowReflectModal(false);
    setPendingRewrite(null);
  }, [pendingRewrite, onApplyRewrite]);

  // Calculate estimated credit cost
  const estimatedCost = Math.min(5, Math.ceil(content.length / 800));

  return (
    <div className={cn("flex flex-col", className)}>
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <CardHeader className="border-b shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <SparkleIcon />
              AI添削
            </CardTitle>
            {creditCost !== null && (
              <span className="text-xs text-muted-foreground">
                消費: {creditCost}クレジット
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4">
          {/* Initial State - Request Review */}
          {!review && !isLoading && (
            <div className="space-y-4">
              {/* Style Selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  リライトスタイル
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStyleDropdown(!showStyleDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span>{selectedStyle}</span>
                    <ChevronDownIcon />
                  </button>
                  {showStyleDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                      {availableStyles.map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => {
                            setSelectedStyle(style);
                            setShowStyleDropdown(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                            selectedStyle === style && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!isPaid && (
                  <p className="text-xs text-muted-foreground mt-1">
                    有料プランでさらに5種類のスタイルが選べます
                  </p>
                )}
              </div>

              {/* Credit Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  予想消費クレジット: <strong>{estimatedCost}</strong>
                  <span className="text-muted-foreground/60">
                    {" "}（{content.length}文字 ÷ 800 = {estimatedCost}、上限5）
                  </span>
                </p>
              </div>

              {/* Request Button */}
              <Button onClick={handleRequestReview} className="w-full" disabled={content.length < 10}>
                <SparkleIcon />
                添削を実行
              </Button>

              {content.length < 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  10文字以上入力してから添削を実行してください
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <LoadingSpinner />
              <p className="text-sm text-muted-foreground">AI添削を実行中...</p>
              <p className="text-xs text-muted-foreground">
                数秒〜数十秒かかる場合があります
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <Button variant="outline" onClick={clearReview} className="w-full">
                再試行
              </Button>
            </div>
          )}

          {/* Review Results */}
          {review && !isLoading && (
            <div className="space-y-6">
              {/* Scores */}
              <ScoreDisplay scores={review.scores} hasCompanyRag={hasCompanyRag} />

              {/* Improvements */}
              <ImprovementList issues={review.top3} />

              {/* Section Feedbacks (Paid only) */}
              {isPaid && review.section_feedbacks && review.section_feedbacks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">設問別指摘</h4>
                  <div className="space-y-3">
                    {review.section_feedbacks.map((sf, index) => {
                      // Find char limit for this section
                      const sectionInfo = sectionData?.find(s => s.title === sf.section_title);
                      const charLimit = sectionInfo?.charLimit;

                      return (
                        <div
                          key={index}
                          className="p-3 bg-muted/50 border border-border rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-primary">
                              {sf.section_title}
                            </p>
                            {charLimit && (
                              <span className="text-xs text-muted-foreground">
                                制限: {charLimit}文字
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {sf.feedback}
                          </p>
                          {sf.rewrite && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                改善例{charLimit ? `（${charLimit}文字以内）` : ""}:
                              </p>
                              <p className="text-sm bg-background p-2 rounded border border-border">
                                {sf.rewrite}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-1 text-xs"
                                onClick={() => handleApplyRewrite(sf.rewrite!)}
                              >
                                この改善例を反映
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rewrites */}
              <RewriteDisplay rewrites={review.rewrites} onApply={handleApplyRewrite} />

              {/* New Review Button */}
              <Button variant="outline" onClick={clearReview} className="w-full">
                新しい添削を実行
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reflect Modal */}
      <ReflectModal
        isOpen={showReflectModal}
        onClose={() => {
          setShowReflectModal(false);
          setPendingRewrite(null);
        }}
        onConfirm={handleConfirmReflect}
        onUndo={onUndo}
        originalText={content}
        newText={pendingRewrite || ""}
        isFullDocument={true}
      />
    </div>
  );
}
