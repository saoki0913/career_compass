"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useOperationLock } from "@/hooks/useOperationLock";
import { useESReview, getAvailableStyles, TEMPLATE_OPTIONS, TEMPLATE_LABELS, TEMPLATE_EXTRA_FIELDS } from "@/hooks/useESReview";
import type { SectionData, TemplateType, TemplateReview } from "@/hooks/useESReview";
import { ScoreDisplay } from "./ScoreDisplay";
import { ImprovementList } from "./ImprovementList";
import { RewriteDisplay } from "./RewriteDisplay";
import { CompareView } from "./CompareView";
import { ReflectModal } from "./ReflectModal";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { EnhancedProcessingSteps, ES_REVIEW_STEPS } from "@/components/ui/EnhancedProcessingSteps";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateESReviewCost } from "@/lib/credits/cost";

// Section review request from parent component
interface SectionReviewRequest {
  sectionTitle: string;
  sectionContent: string;
  sectionCharLimit?: number;
}

interface ReviewPanelProps {
  documentId: string;
  content: string;
  sections?: string[];
  sectionData?: SectionData[];  // Section data with character limits
  hasCompanyRag?: boolean;
  companyId?: string;
  companyName?: string;
  isPaid?: boolean;
  onApplyRewrite?: (newContent: string, sectionTitle?: string | null) => void;
  onUndo?: () => void;
  className?: string;
  // Section review mode
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
  // Cross-panel navigation
  onScrollToEditorSection?: (sectionTitle: string) => void;
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

// Real-time credit cost indicator component (UX Psychology: Cognitive Load Reduction)
interface CreditCostIndicatorProps {
  charCount: number;
  className?: string;
}

function CreditCostIndicator({ charCount, className }: CreditCostIndicatorProps) {
  const cost = calculateESReviewCost(charCount);
  const nextThreshold = cost < 5 ? cost * 800 : null;
  const charsToNext = nextThreshold ? nextThreshold - charCount : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">予想消費クレジット</span>
        <span className="text-sm font-semibold text-primary">{cost} クレジット</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Visual credit bar */}
        <div className="flex gap-0.5 flex-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-sm transition-all duration-300",
                i <= cost ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        {/* Character info */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {charCount}文字
        </span>
      </div>
      {/* Next threshold hint */}
      {charsToNext !== null && charsToNext > 0 && (
        <p className="text-xs text-muted-foreground">
          あと<span className="font-medium text-foreground">{charsToNext}</span>文字で +1 クレジット
        </p>
      )}
      {cost === 5 && (
        <p className="text-xs text-amber-600">
          上限の5クレジットに達しています
        </p>
      )}
    </div>
  );
}

export function ReviewPanel({
  documentId,
  content,
  sections,
  sectionData,
  hasCompanyRag = false,
  companyId,
  companyName,
  isPaid = false,
  onApplyRewrite,
  onUndo,
  className,
  sectionReviewRequest,
  onClearSectionReview,
  onScrollToEditorSection,
}: ReviewPanelProps) {
  const { isLocked, acquireLock, releaseLock } = useOperationLock();
  const [selectedStyle, setSelectedStyle] = useState("バランス");
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);
  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState<"rewrites" | "template">("rewrites");
  // Compare view state
  const [showCompareView, setShowCompareView] = useState(false);
  // Template extra fields
  const [internName, setInternName] = useState<string>("");
  const [roleName, setRoleName] = useState<string>("");

  const {
    review,
    isLoading,
    error,
    creditCost,
    reviewMode,
    currentSection,
    cancelReview,
    isCancelling,
    elapsedTime,
    sseProgress,
    requestReview,
    requestSectionReview,
    clearReview,
  } = useESReview({ documentId });

  // Clear template selection and extra fields when sectionReviewRequest changes
  useEffect(() => {
    if (sectionReviewRequest) {
      // Reset template selection and extra fields when a new section is selected
      setSelectedTemplate(null);
      setInternName("");
      setRoleName("");
    }
  }, [sectionReviewRequest]);

  // Sticky score: track ScoreDisplay visibility via IntersectionObserver
  useEffect(() => {
    const el = scoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsScoreVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [review]);

  const availableStyles = getAvailableStyles(isPaid);

  const handleRequestReview = useCallback(async () => {
    if (!acquireLock("ES添削を実行中")) return;
    try {
      await requestReview({
        content,
        style: selectedStyle,
        hasCompanyRag,
        companyId,
        sections: isPaid ? sections : undefined,
        sectionData: isPaid ? sectionData : undefined,
        reviewMode: "full",
      });
    } finally {
      releaseLock();
    }
  }, [content, selectedStyle, hasCompanyRag, companyId, sections, sectionData, isPaid, requestReview, acquireLock, releaseLock]);

  // Handle section review with optional template
  const handleSectionReview = useCallback(async () => {
    if (!sectionReviewRequest) return;
    if (!acquireLock("ES添削を実行中")) return;

    try {
      await requestSectionReview({
        sectionTitle: sectionReviewRequest.sectionTitle,
        sectionContent: sectionReviewRequest.sectionContent,
        sectionCharLimit: sectionReviewRequest.sectionCharLimit,
        style: selectedStyle,
        hasCompanyRag,
        companyId,
        templateType: selectedTemplate || undefined,
        internName: internName || undefined,
        roleName: roleName || undefined,
      });
    } finally {
      releaseLock();
    }
  }, [sectionReviewRequest, selectedStyle, hasCompanyRag, companyId, selectedTemplate, internName, roleName, requestSectionReview, acquireLock, releaseLock]);

  // Handler to return to full mode
  const handleReturnToFullMode = useCallback(() => {
    if (review) {
      const confirmed = window.confirm("現在の添削結果は破棄されます。ES全体添削に切り替えますか？");
      if (!confirmed) return;
    }
    clearReview();
    onClearSectionReview?.();
  }, [review, clearReview, onClearSectionReview]);

  const handleApplyRewrite = useCallback(
    (rewriteText: string) => {
      setPendingRewrite(rewriteText);
      setShowReflectModal(true);
    },
    []
  );

  const openFullscreen = useCallback((mode: "rewrites" | "template") => {
    setFullscreenMode(mode);
    setShowFullscreen(true);
  }, []);

  const handleConfirmReflect = useCallback(() => {
    if (pendingRewrite && onApplyRewrite) {
      const sectionTitle = reviewMode === "section" && currentSection
        ? currentSection.title
        : null;
      onApplyRewrite(pendingRewrite, sectionTitle);
    }
    setShowReflectModal(false);
    setPendingRewrite(null);
  }, [pendingRewrite, onApplyRewrite, reviewMode, currentSection]);

  // Scroll to improvement section when clicking low score link
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const [isScoreVisible, setIsScoreVisible] = useState(true);
  const handleScrollToIssue = useCallback((category: string) => {
    const element = document.getElementById(`issue-${category}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // Add highlight animation
      element.classList.add("ring-2", "ring-primary", "ring-offset-2");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 2000);
    }
  }, []);

  // Calculate estimated credit cost (different for section vs full mode)
  const contentForCost = sectionReviewRequest?.sectionContent || content;
  const estimatedCost = Math.min(5, Math.ceil(contentForCost.length / 800));

  // Get character limit for RewriteDisplay
  const currentCharLimit = sectionReviewRequest?.sectionCharLimit || undefined;
  const templateReview = review?.template_review || null;

  return (
    <div className={cn("flex flex-col", className)}>
      <Card className="flex flex-col py-0 gap-0">
        {/* Header - Compact single line */}
        <CardHeader className="border-b shrink-0 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <SparkleIcon />
              <span className="text-sm font-semibold shrink-0">AI添削</span>
              {reviewMode === "section" && currentSection && (
                <>
                  <span className="text-muted-foreground shrink-0">:</span>
                  <span className="text-sm truncate" title={currentSection.title}>
                    {currentSection.title}
                  </span>
                  {currentSection.charLimit && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({currentSection.charLimit}字)
                    </span>
                  )}
                </>
              )}
            </div>
            {creditCost !== null && (
              <span className="text-xs text-muted-foreground shrink-0">
                {creditCost}pt
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent ref={scrollContainerRef} className="p-4 relative">
          {/* Sticky Score Summary - appears when ScoreDisplay scrolls out of view */}
          {review && !isLoading && !isScoreVisible && (
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-lg font-bold",
                  (() => {
                    const values = Object.values(review.scores).filter((v): v is number => typeof v === "number");
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    if (avg >= 4.5) return "text-emerald-600";
                    if (avg >= 4.0) return "text-emerald-600";
                    if (avg >= 3.5) return "text-blue-600";
                    if (avg >= 3.0) return "text-amber-600";
                    return "text-red-600";
                  })()
                )}>
                  {(() => {
                    const values = Object.values(review.scores).filter((v): v is number => typeof v === "number");
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    if (avg >= 4.5) return "A+";
                    if (avg >= 4.0) return "A";
                    if (avg >= 3.5) return "B+";
                    if (avg >= 3.0) return "B";
                    if (avg >= 2.5) return "C+";
                    if (avg >= 2.0) return "C";
                    return "D";
                  })()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const values = Object.values(review.scores).filter((v): v is number => typeof v === "number");
                    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
                  })()}/5.0
                </span>
              </div>
              {review.top3 && review.top3.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {review.top3.length}件の改善ポイント
                </span>
              )}
            </div>
          )}

          {/* Initial State - Guided Empty State (no section selected) */}
          {!review && !isLoading && !error && !sectionReviewRequest && (
            <ReviewEmptyState
              onStartFullReview={handleRequestReview}
              hasContent={content.length >= 10}
              selectedStyle={selectedStyle}
              onStyleChange={setSelectedStyle}
              availableStyles={availableStyles}
              hasCompanyRag={hasCompanyRag}
              companyName={companyName}
              companyId={companyId}
            />
          )}

          {/* Initial State - Section Review Mode */}
          {!review && !isLoading && !error && sectionReviewRequest && (
            <div className="space-y-3">
              {/* Section Review Mode: Template Selector */}
              {sectionReviewRequest && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    テンプレート（任意）
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-border/60 rounded-lg text-sm hover:bg-muted/50 hover:border-border transition-all duration-200 cursor-pointer"
                    >
                      <span className={selectedTemplate ? "" : "text-muted-foreground"}>
                        {selectedTemplate ? TEMPLATE_LABELS[selectedTemplate] : "テンプレートを選択"}
                      </span>
                      <ChevronDownIcon />
                    </button>
                    {showTemplateDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/50 rounded-lg shadow-lg z-10 overflow-hidden max-h-64 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTemplate(null);
                            setShowTemplateDropdown(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-all duration-200 cursor-pointer",
                            selectedTemplate === null && "bg-muted/50"
                          )}
                        >
                          テンプレートなし
                        </button>
                        {TEMPLATE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(option.value);
                              setShowTemplateDropdown(false);
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-all duration-200 cursor-pointer",
                              selectedTemplate === option.value && "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTemplate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      テンプレートを使用すると、3パターンの改善案とメリット・デメリットが表示されます
                    </p>
                  )}
                </div>
              )}

              {/* Template Extra Fields - インターン名 (intern_reason, intern_goals) */}
              {selectedTemplate && TEMPLATE_EXTRA_FIELDS[selectedTemplate].includes("intern_name") && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    インターン名
                  </label>
                  <input
                    type="text"
                    value={internName}
                    onChange={(e) => setInternName(e.target.value)}
                    placeholder="例: 2024年夏インターン"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {/* Template Extra Fields - 職種・コース名 (role_course_reason) */}
              {selectedTemplate && TEMPLATE_EXTRA_FIELDS[selectedTemplate].includes("role_name") && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    職種・コース名
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="例: エンジニアコース"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {/* Style Selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  リライトスタイル
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStyleDropdown(!showStyleDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-border/60 rounded-lg text-sm hover:bg-muted/50 hover:border-border transition-all duration-200 cursor-pointer"
                  >
                    <span>{selectedStyle}</span>
                    <ChevronDownIcon />
                  </button>
                  {showStyleDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/50 rounded-lg shadow-lg z-10 overflow-hidden">
                      {availableStyles.map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => {
                            setSelectedStyle(style);
                            setShowStyleDropdown(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-all duration-200 cursor-pointer",
                            selectedStyle === style && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!isPaid && !sectionReviewRequest && (
                  <p className="text-xs text-muted-foreground mt-1">
                    有料プランでさらに5種類のスタイルが選べます
                  </p>
                )}
              </div>

              {/* Credit Cost Indicator - Real-time visual feedback */}
              <div className="p-2 bg-muted/30 rounded">
                <CreditCostIndicator charCount={contentForCost.length} />
              </div>

              {/* Request Button */}
              <Button
                onClick={handleSectionReview}
                className="w-full"
                disabled={sectionReviewRequest.sectionContent.length < 10 || isLocked}
              >
                <SparkleIcon />
                この設問を添削
              </Button>

              {sectionReviewRequest.sectionContent.length < 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  10文字以上入力してから添削を実行してください
                </p>
              )}
            </div>
          )}

          {/* Loading State - Labor Illusion: Show processing steps with cancel option */}
          {isLoading && (
            <EnhancedProcessingSteps
              steps={sseProgress.isStreaming ? sseProgress.steps : ES_REVIEW_STEPS}
              isActive={isLoading}
              elapsedTime={elapsedTime}
              onCancel={cancelReview}
              isCancelling={isCancelling}
              cancelLabel="キャンセル"
              sseCurrentStep={sseProgress.isStreaming ? sseProgress.currentStep : undefined}
              sseProgress={sseProgress.isStreaming ? sseProgress.progress : undefined}
            />
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
            <div className="space-y-4">
              {/* Scores - with scroll-to-issue links for low scores */}
              <div ref={scoreRef}>
                <ScoreDisplay
                  scores={review.scores}
                  hasCompanyRag={hasCompanyRag}
                />
              </div>

              {!hasCompanyRag && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-2">
                  <p>
                    企業情報が未取得のため「企業接続」評価は反映されていません。
                  </p>
                  {companyId && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/companies/${companyId}`}>
                        企業情報を取得して再評価
                      </Link>
                    </Button>
                  )}
                </div>
              )}

              {/* Separator: Improvements */}
              {review.top3 && review.top3.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">改善</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <ImprovementList
                    issues={review.top3}
                    onNavigateToSection={
                      reviewMode === "section" && currentSection && onScrollToEditorSection
                        ? () => onScrollToEditorSection(currentSection.title)
                        : undefined
                    }
                  />
                </>
              )}

              {/* Separator: Rewrites */}
              {!review.template_review && review.rewrites && review.rewrites.length > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">リライト</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {/* Rewrites - Tab-based display with compare option */}
              {!review.template_review && (
                <RewriteDisplay
                  rewrites={review.rewrites}
                  onApply={handleApplyRewrite}
                  originalText={sectionReviewRequest?.sectionContent || content}
                  charLimit={currentCharLimit}
                  onOpenFullscreen={() => openFullscreen("rewrites")}
                  onOpenCompare={() => setShowCompareView(true)}
                />
              )}

              {/* Template Review Results (Section mode with template) */}
              {review.template_review && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">テンプレート添削結果</h4>
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {TEMPLATE_LABELS[review.template_review.template_type as TemplateType]}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openFullscreen("template")}
                      className="h-7 px-2 text-xs"
                    >
                      全画面で表示
                    </Button>
                  </div>

                  {/* Strengthen Points (if available) */}
                  {review.template_review.strengthen_points && review.template_review.strengthen_points.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-700 mb-1">強化ポイント</p>
                      <ul className="text-sm text-blue-800 space-y-1">
                        {review.template_review.strengthen_points.map((point, i) => (
                          <li key={i}>• {point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Variants */}
                  <div className="space-y-4">
                    {review.template_review.variants.map((variant, index) => (
                      <div
                        key={index}
                        className="p-4 border border-border rounded-lg space-y-3"
                      >
                        {review.template_review && review.template_review.variants.length > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-primary">
                              パターン {index + 1}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {variant.char_count}文字
                            </span>
                          </div>
                        )}
                        {review.template_review && review.template_review.variants.length === 1 && (
                          <div className="flex items-center justify-end">
                            <span className="text-xs text-muted-foreground">
                              {variant.char_count}文字
                            </span>
                          </div>
                        )}

                        {/* Text */}
                        <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">
                          {variant.text}
                        </p>

                        {/* Pros and Cons - only show when multiple variants */}
                        {review.template_review && review.template_review.variants.length > 1 && variant.pros.length > 0 && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs font-medium text-green-700 mb-1">メリット</p>
                              <ul className="text-xs text-green-800 space-y-0.5">
                                {variant.pros.map((pro, i) => (
                                  <li key={i}>+ {pro}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-orange-700 mb-1">デメリット</p>
                              <ul className="text-xs text-orange-800 space-y-0.5">
                                {variant.cons.map((con, i) => (
                                  <li key={i}>- {con}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Keywords */}
                        {variant.keywords_used.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              使用キーワード
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {variant.keywords_used.map((kw, i) => (
                                <span
                                  key={i}
                                  className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                                >
                                  {kw}
                                  {variant.keyword_sources[i] && (
                                    <span className="text-primary/60 ml-1">
                                      [{variant.keyword_sources[i]}]
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Apply Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleApplyRewrite(variant.text)}
                        >
                          この改善案を反映
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Keyword Sources */}
                  {review.template_review.keyword_sources.length > 0 && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        キーワード出典
                      </p>
                      <div className="space-y-1">
                        {review.template_review.keyword_sources.map((source) => (
                          <div key={source.source_id} className="text-xs">
                            <span className="font-mono text-primary mr-1">{source.source_id}:</span>
                            <a
                              href={source.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {source.content_type}
                            </a>
                            {source.excerpt && (
                              <span className="text-muted-foreground ml-1">
                                - {source.excerpt.substring(0, 50)}...
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section Feedbacks (Paid only, full mode only) */}
              {reviewMode === "full" && isPaid && review.section_feedbacks && review.section_feedbacks.length > 0 && (
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

              {/* Action Buttons */}
              <div className="space-y-2">
                {/* Return to full mode button (section mode only) */}
                {reviewMode === "section" && (
                  <Button
                    variant="default"
                    onClick={handleReturnToFullMode}
                    className="w-full"
                  >
                    <SparkleIcon />
                    ES全体を添削
                  </Button>
                )}

                {/* New Review Button */}
                <Button variant="outline" onClick={clearReview} className="w-full">
                  {reviewMode === "section" ? "この設問を再添削" : "新しい添削を実行"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen Results */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent
          className="top-0 left-0 translate-x-0 translate-y-0 w-screen max-w-none h-[100dvh] sm:h-[90dvh] rounded-none sm:rounded-lg p-0 flex flex-col"
          showCloseButton
        >
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base">
              {fullscreenMode === "template" ? "テンプレート添削結果" : "リライト候補"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {fullscreenMode === "rewrites" && review && !review.template_review && (
              <RewriteDisplay
                rewrites={review.rewrites}
                onApply={handleApplyRewrite}
                originalText={sectionReviewRequest?.sectionContent || content}
                charLimit={currentCharLimit}
                layout="stack"
              />
            )}
            {fullscreenMode === "template" && templateReview && (
              <div className="space-y-4 max-w-3xl mx-auto">
                {templateReview.strengthen_points && templateReview.strengthen_points.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-medium text-blue-700 mb-1">強化ポイント</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      {templateReview.strengthen_points.map((point, i) => (
                        <li key={i}>• {point}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {templateReview.variants.map((variant, index) => (
                  <div key={index} className="p-4 border border-border rounded-lg space-y-3">
                    {templateReview.variants.length > 1 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">パターン {index + 1}</span>
                        <span className="text-xs text-muted-foreground">{variant.char_count}文字</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end">
                        <span className="text-xs text-muted-foreground">{variant.char_count}文字</span>
                      </div>
                    )}
                    <p className="text-base leading-relaxed bg-muted/30 p-4 rounded-lg">
                      {variant.text}
                    </p>
                    {templateReview.variants.length > 1 && variant.pros.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium text-green-700 mb-1">メリット</p>
                          <ul className="text-xs text-green-800 space-y-0.5">
                            {variant.pros.map((pro, i) => (
                              <li key={i}>+ {pro}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-orange-700 mb-1">デメリット</p>
                          <ul className="text-xs text-orange-800 space-y-0.5">
                            {variant.cons.map((con, i) => (
                              <li key={i}>- {con}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {variant.keywords_used.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">使用キーワード</p>
                        <div className="flex flex-wrap gap-1">
                          {variant.keywords_used.map((kw, i) => (
                            <span
                              key={i}
                              className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                            >
                              {kw}
                              {variant.keyword_sources[i] && (
                                <span className="text-primary/60 ml-1">
                                  [{variant.keyword_sources[i]}]
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleApplyRewrite(variant.text)}
                    >
                      この改善案を反映
                    </Button>
                  </div>
                ))}
                {templateReview.keyword_sources.length > 0 && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-2">キーワード出典</p>
                    <div className="space-y-1">
                      {templateReview.keyword_sources.map((source) => (
                        <div key={source.source_id} className="text-xs">
                          <span className="font-mono text-primary mr-1">{source.source_id}:</span>
                          <a
                            href={source.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {source.content_type}
                          </a>
                          {source.excerpt && (
                            <span className="text-muted-foreground ml-1">
                              - {source.excerpt.substring(0, 80)}...
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reflect Modal */}
      <ReflectModal
        isOpen={showReflectModal}
        onClose={() => {
          setShowReflectModal(false);
          setPendingRewrite(null);
        }}
        onConfirm={handleConfirmReflect}
        onUndo={onUndo}
        originalText={reviewMode === "section" && sectionReviewRequest
          ? sectionReviewRequest.sectionContent
          : content}
        newText={pendingRewrite || ""}
        isFullDocument={reviewMode !== "section"}
      />

      {/* Compare View Modal */}
      {review && !review.template_review && (
        <CompareView
          isOpen={showCompareView}
          onClose={() => setShowCompareView(false)}
          originalText={sectionReviewRequest?.sectionContent || content}
          rewrites={review.rewrites}
          charLimit={currentCharLimit}
          onApply={handleApplyRewrite}
        />
      )}
    </div>
  );
}
