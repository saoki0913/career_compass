"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useESReview, getAvailableStyles, TEMPLATE_OPTIONS, TEMPLATE_LABELS, TEMPLATE_EXTRA_FIELDS } from "@/hooks/useESReview";
import type { SectionData, TemplateType, TemplateReview } from "@/hooks/useESReview";
import { ScoreDisplay } from "./ScoreDisplay";
import { ImprovementList } from "./ImprovementList";
import { RewriteDisplay } from "./RewriteDisplay";
import { ReflectModal } from "./ReflectModal";

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
  isPaid?: boolean;
  onApplyRewrite?: (newContent: string) => void;
  onUndo?: () => void;
  className?: string;
  // Section review mode
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
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
  companyId,
  isPaid = false,
  onApplyRewrite,
  onUndo,
  className,
  sectionReviewRequest,
  onClearSectionReview,
}: ReviewPanelProps) {
  const [selectedStyle, setSelectedStyle] = useState("バランス");
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);
  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
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

  const availableStyles = getAvailableStyles(isPaid);

  const handleRequestReview = useCallback(async () => {
    await requestReview({
      content,
      style: selectedStyle,
      hasCompanyRag,
      companyId,
      sections: isPaid ? sections : undefined,
      sectionData: isPaid ? sectionData : undefined,
      reviewMode: "full",
    });
  }, [content, selectedStyle, hasCompanyRag, companyId, sections, sectionData, isPaid, requestReview]);

  // Handle section review with optional template
  const handleSectionReview = useCallback(async () => {
    if (!sectionReviewRequest) return;

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
  }, [sectionReviewRequest, selectedStyle, hasCompanyRag, companyId, selectedTemplate, internName, roleName, requestSectionReview]);

  // Handler to return to full mode
  const handleReturnToFullMode = useCallback(() => {
    clearReview();
    onClearSectionReview?.();
  }, [clearReview, onClearSectionReview]);

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

  // Calculate estimated credit cost (different for section vs full mode)
  const contentForCost = sectionReviewRequest?.sectionContent || content;
  const estimatedCost = Math.min(5, Math.ceil(contentForCost.length / 800));

  return (
    <div className={cn("flex flex-col", className)}>
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <CardHeader className="border-b shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <SparkleIcon />
              AI添削
              {reviewMode === "section" && (
                <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  設問
                </span>
              )}
            </CardTitle>
            {creditCost !== null && (
              <span className="text-xs text-muted-foreground">
                消費: {creditCost}クレジット
              </span>
            )}
          </div>
          {/* Current section info for section mode */}
          {reviewMode === "section" && currentSection && (
            <div className="mt-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm font-medium text-primary truncate">
                {currentSection.title}
              </p>
              {currentSection.charLimit && (
                <p className="text-xs text-muted-foreground mt-1">
                  文字数制限: {currentSection.charLimit}文字
                </p>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4">
          {/* Initial State - Request Review */}
          {!review && !isLoading && (
            <div className="space-y-4">
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

              {/* Credit Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  予想消費クレジット: <strong>{estimatedCost}</strong>
                  <span className="text-muted-foreground/60">
                    {" "}（{contentForCost.length}文字 ÷ 800 = {estimatedCost}、上限5）
                  </span>
                </p>
              </div>

              {/* Request Button */}
              {sectionReviewRequest ? (
                <Button
                  onClick={handleSectionReview}
                  className="w-full"
                  disabled={sectionReviewRequest.sectionContent.length < 10}
                >
                  <SparkleIcon />
                  この設問を添削
                </Button>
              ) : (
                <Button onClick={handleRequestReview} className="w-full" disabled={content.length < 10}>
                  <SparkleIcon />
                  添削を実行
                </Button>
              )}

              {((sectionReviewRequest && sectionReviewRequest.sectionContent.length < 10) ||
                (!sectionReviewRequest && content.length < 10)) && (
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

              {/* Improvements */}
              <ImprovementList
                issues={review.top3}
                title={reviewMode === "section" ? "改善ポイント" : undefined}
              />

              {/* Template Review Results (Section mode with template) */}
              {review.template_review && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">テンプレート添削結果</h4>
                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {TEMPLATE_LABELS[review.template_review.template_type as TemplateType]}
                    </span>
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-primary">
                            パターン {index + 1}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {variant.char_count}文字
                          </span>
                        </div>

                        {/* Text */}
                        <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">
                          {variant.text}
                        </p>

                        {/* Pros and Cons */}
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

              {/* Rewrites (show only if no template_review) */}
              {!review.template_review && (
                <RewriteDisplay rewrites={review.rewrites} onApply={handleApplyRewrite} />
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
