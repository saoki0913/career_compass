"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOperationLock } from "@/hooks/useOperationLock";
import {
  getAvailableStyles,
  TEMPLATE_EXTRA_FIELDS,
  TEMPLATE_LABELS,
  TEMPLATE_OPTIONS,
  useESReview,
} from "@/hooks/useESReview";
import type { ReviewScores, SectionData, TemplateReview, TemplateType } from "@/hooks/useESReview";
import { ScoreDisplay, getScoreSummary } from "./ScoreDisplay";
import { ImprovementList } from "./ImprovementList";
import { RewriteDisplay } from "./RewriteDisplay";
import { CompareView } from "./CompareView";
import { ReflectModal } from "./ReflectModal";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { EnhancedProcessingSteps, ES_REVIEW_STEPS } from "@/components/ui/EnhancedProcessingSteps";
import { calculateESReviewCost } from "@/lib/credits/cost";
import { toast } from "sonner";

interface SectionReviewRequest {
  sectionTitle: string;
  sectionContent: string;
  sectionCharLimit?: number;
}

interface ReviewPanelProps {
  documentId: string;
  content: string;
  sections?: string[];
  sectionData?: SectionData[];
  hasCompanyRag?: boolean;
  companyId?: string;
  companyName?: string;
  isPaid?: boolean;
  onApplyRewrite?: (newContent: string, sectionTitle?: string | null) => void;
  onUndo?: () => void;
  className?: string;
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
  onScrollToEditorSection?: (sectionTitle: string) => void;
}

const SparkleIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

interface CreditCostIndicatorProps {
  charCount: number;
}

function CreditCostIndicator({ charCount }: CreditCostIndicatorProps) {
  const cost = calculateESReviewCost(charCount);
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">予想消費クレジット</span>
        <span className="text-sm font-semibold text-foreground">{cost} クレジット</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{charCount}文字</span>
        <span>800文字ごとに+1</span>
      </div>
    </div>
  );
}

function SelectionChips({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SourceLinks({
  sources,
}: {
  sources: Array<{ source_id: string; source_url: string; content_type: string; excerpt?: string }>;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">キーワード出典</h4>
      <div className="space-y-2">
        {sources.map((source) => {
          const clickable = Boolean(source.source_url);
          const content = (
            <div className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{source.content_type || "参考情報"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{source.source_id}</p>
                </div>
                {clickable && <span className="text-xs font-medium text-primary">外部サイトへ</span>}
              </div>
              {source.excerpt && (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.excerpt}</p>
              )}
            </div>
          );

          if (!clickable) {
            return <div key={source.source_id}>{content}</div>;
          }

          return (
            <a key={source.source_id} href={source.source_url} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function TemplateResults({
  templateReview,
  onApply,
  onOpenFullscreen,
  showFullscreenButton = true,
}: {
  templateReview: TemplateReview;
  onApply: (text: string) => void;
  onOpenFullscreen: () => void;
  showFullscreenButton?: boolean;
}) {
  const variant = templateReview.variants[0];
  if (!variant) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">リライト案</h4>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {TEMPLATE_LABELS[templateReview.template_type as TemplateType]}
          </span>
        </div>
        {showFullscreenButton && (
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={onOpenFullscreen}>
            全画面で表示
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">完成稿の改善案</span>
          <span className="text-xs text-muted-foreground">{variant.char_count}文字</span>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{variant.text}</p>
        {variant.keywords_used.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {variant.keywords_used.map((keyword, index) => (
              <span key={`${keyword}-${index}`} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                {keyword}
              </span>
            ))}
          </div>
        )}
        <Button className="mt-4 w-full" onClick={() => onApply(variant.text)}>
          このリライト案を反映
        </Button>
      </div>

      <SourceLinks sources={templateReview.keyword_sources} />
    </div>
  );
}

export function ReviewPanel({
  documentId,
  content,
  hasCompanyRag = false,
  companyId,
  companyName,
  isPaid = false,
  onApplyRewrite,
  onUndo,
  className,
  sectionReviewRequest,
  onClearSectionReview,
}: ReviewPanelProps) {
  const { acquireLock, releaseLock } = useOperationLock();
  const [selectedStyle, setSelectedStyle] = useState("バランス");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [internName, setInternName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);
  const [showCompareView, setShowCompareView] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [isScoreVisible, setIsScoreVisible] = useState(true);
  const scoreRef = useRef<HTMLDivElement>(null);

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
    partialReview,
    requestSectionReview,
    clearReview,
  } = useESReview({ documentId });

  const availableStyles = getAvailableStyles(isPaid);
  const styleOptions = availableStyles.map((style) => ({ value: style, label: style }));
  const templateOptions = [
    { value: "auto", label: "自動" },
    ...TEMPLATE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
  ];

  const displayScores = (review?.scores ?? partialReview.scores ?? null) as ReviewScores | null;
  const displayTop3 = review?.top3 ?? (partialReview.top3.length > 0 ? partialReview.top3 : null);
  const displayRewrites = review?.rewrites ?? (partialReview.rewrites.length > 0 ? partialReview.rewrites : null);
  const streamingRewriteText = partialReview.streamingRewriteText.trim();
  const currentCharLimit = sectionReviewRequest?.sectionCharLimit;
  const effectiveHasCompanyRag = useMemo(() => {
    if (review?.scores?.company_connection !== undefined) return true;
    if (partialReview.scores?.company_connection !== undefined) return true;
    if (review?.template_review?.keyword_sources?.length) return true;
    return hasCompanyRag;
  }, [hasCompanyRag, partialReview.scores?.company_connection, review]);

  useEffect(() => {
    if (sectionReviewRequest) {
      setSelectedTemplate(null);
      setInternName("");
      setRoleName("");
    }
  }, [sectionReviewRequest]);

  useEffect(() => {
    if (review && !isLoading && creditCost !== null) {
      toast.success("添削完了", { description: `${creditCost}クレジット消費しました` });
    }
  }, [creditCost, isLoading, review]);

  useEffect(() => {
    const element = scoreRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsScoreVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayScores]);

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
        templateType: selectedTemplate ?? undefined,
        internName: internName || undefined,
        roleName: roleName || undefined,
      });
    } finally {
      releaseLock();
    }
  }, [acquireLock, companyId, hasCompanyRag, internName, releaseLock, requestSectionReview, roleName, sectionReviewRequest, selectedStyle, selectedTemplate]);

  const handleApplyRewrite = useCallback((rewriteText: string) => {
    setPendingRewrite(rewriteText);
    setShowReflectModal(true);
  }, []);

  const handleConfirmReflect = useCallback(() => {
    if (pendingRewrite && onApplyRewrite) {
      onApplyRewrite(pendingRewrite, reviewMode === "section" && currentSection ? currentSection.title : null);
    }
    setShowReflectModal(false);
    setPendingRewrite(null);
  }, [currentSection, onApplyRewrite, pendingRewrite, reviewMode]);

  const handleReset = useCallback(() => {
    clearReview();
    onClearSectionReview?.();
  }, [clearReview, onClearSectionReview]);

  const scoreSummary = displayScores ? getScoreSummary(displayScores, effectiveHasCompanyRag) : null;

  const selectedTemplateFields = selectedTemplate ? TEMPLATE_EXTRA_FIELDS[selectedTemplate] : [];

  return (
    <div className={cn("flex flex-col", className)}>
      <Card className="flex flex-col gap-0 py-0">
        <CardHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SparkleIcon />
                <span className="text-sm font-semibold text-foreground">AI添削</span>
                {sectionReviewRequest?.sectionTitle && (
                  <span className="truncate text-sm text-muted-foreground">{sectionReviewRequest.sectionTitle}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                企業情報と結びつけて、改善点とリライト案を返します。
              </p>
            </div>
            {creditCost !== null && <span className="text-xs text-muted-foreground">{creditCost}pt</span>}
          </div>
        </CardHeader>

        <CardContent className="relative p-4">
          {scoreSummary && !isLoading && !isScoreVisible && (
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-lg font-bold", scoreSummary.gradeColor)}>{scoreSummary.grade}</span>
                <span className="text-xs text-muted-foreground">{scoreSummary.average.toFixed(1)}/5.0</span>
              </div>
              {displayTop3 && <span className="text-xs text-muted-foreground">改善ポイント {displayTop3.length}件</span>}
            </div>
          )}

          {!sectionReviewRequest && !review && !isLoading && !error && (
            <ReviewEmptyState hasCompanyRag={effectiveHasCompanyRag} companyName={companyName} companyId={companyId} />
          )}

          {sectionReviewRequest && !review && !isLoading && !error && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{sectionReviewRequest.sectionTitle}</h3>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      この設問に合わせて評価し、改善ポイントとリライト案を返します。
                    </p>
                  </div>
                  {sectionReviewRequest.sectionCharLimit && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      {sectionReviewRequest.sectionCharLimit}字
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">設問タイプ</label>
                <SelectionChips
                  options={templateOptions}
                  value={selectedTemplate ?? "auto"}
                  onChange={(value) => setSelectedTemplate(value === "auto" ? null : (value as TemplateType))}
                />
              </div>

              {selectedTemplateFields.includes("intern_name") && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">インターン名</label>
                  <input
                    type="text"
                    value={internName}
                    onChange={(event) => setInternName(event.target.value)}
                    placeholder="例: 夏季インターン"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0 transition-colors focus:border-primary"
                  />
                </div>
              )}

              {selectedTemplateFields.includes("role_name") && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">職種・コース名</label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                    placeholder="例: エンジニアコース"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-0 transition-colors focus:border-primary"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">リライトスタイル</label>
                <SelectionChips options={styleOptions} value={selectedStyle} onChange={setSelectedStyle} />
                <p className="text-xs text-muted-foreground">選択したスタイルに寄せて、読みやすさと伝わり方を整えます。</p>
              </div>

              <CreditCostIndicator charCount={sectionReviewRequest.sectionContent.length} />

              <Button className="w-full" disabled={sectionReviewRequest.sectionContent.length < 10} onClick={handleSectionReview}>
                <SparkleIcon />
                この設問を添削
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">添削中</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sseProgress.currentStep === "rag_fetch"
                        ? "企業情報を確認しています"
                        : sseProgress.currentStep === "analysis"
                          ? "設問の改善ポイントを整理しています"
                          : sseProgress.currentStep === "rewrite"
                            ? "リライト案を生成しています"
                            : "結果を準備しています"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={cancelReview} disabled={isCancelling}>
                    {isCancelling ? "停止中" : "キャンセル"}
                  </Button>
                </div>
                <div className="mt-4">
                  <EnhancedProcessingSteps
                    steps={sseProgress.isStreaming ? sseProgress.steps : ES_REVIEW_STEPS}
                    isActive={isLoading}
                    elapsedTime={elapsedTime}
                    sseCurrentStep={sseProgress.currentStep ?? undefined}
                    sseProgress={sseProgress.progress}
                  />
                </div>
              </div>

              {(streamingRewriteText || displayRewrites?.[0]) && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">生成中のリライト案</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {streamingRewriteText || displayRewrites?.[0]}
                    {streamingRewriteText && <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/60 align-middle" />}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
              <Button variant="outline" onClick={handleReset}>閉じる</Button>
            </div>
          )}

          {((review && !isLoading) || displayScores || displayTop3 || displayRewrites) && (
            <div className="space-y-5">
              {displayScores && (
                <div ref={scoreRef}>
                  <ScoreDisplay scores={displayScores} hasCompanyRag={effectiveHasCompanyRag} />
                </div>
              )}

              {displayTop3 && <ImprovementList issues={displayTop3} />}

              {review?.template_review ? (
                <TemplateResults
                  templateReview={review.template_review}
                  onApply={handleApplyRewrite}
                  onOpenFullscreen={() => setShowFullscreen(true)}
                />
              ) : (
                displayRewrites && (
                  <RewriteDisplay
                    rewrites={displayRewrites}
                    onApply={handleApplyRewrite}
                    originalText={sectionReviewRequest?.sectionContent || content}
                    charLimit={currentCharLimit}
                    onOpenFullscreen={() => setShowFullscreen(true)}
                    onOpenCompare={() => setShowCompareView(true)}
                  />
                )
              )}

              {review && (
                <Button variant="outline" className="w-full" onClick={clearReview}>
                  この設問を再添削
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent className="h-[92vh] w-[min(96vw,1200px)] max-w-[1200px] overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>リライト案</DialogTitle>
          </DialogHeader>
          <div className="h-full overflow-y-auto px-5 py-4">
            {review?.template_review ? (
              <div className="mx-auto max-w-4xl space-y-4">
                <TemplateResults
                  templateReview={review.template_review}
                  onApply={handleApplyRewrite}
                  onOpenFullscreen={() => undefined}
                  showFullscreenButton={false}
                />
              </div>
            ) : (
              displayRewrites && (
                <div className="mx-auto max-w-4xl">
                  <RewriteDisplay
                    rewrites={displayRewrites}
                    onApply={handleApplyRewrite}
                    originalText={sectionReviewRequest?.sectionContent || content}
                    charLimit={currentCharLimit}
                    layout="stack"
                  />
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!review?.template_review && displayRewrites && (
        <CompareView
          isOpen={showCompareView}
          onClose={() => setShowCompareView(false)}
          originalText={sectionReviewRequest?.sectionContent || content}
          rewrites={displayRewrites}
          charLimit={currentCharLimit}
          onApply={handleApplyRewrite}
        />
      )}

      <ReflectModal
        isOpen={showReflectModal}
        onClose={() => {
          setShowReflectModal(false);
          setPendingRewrite(null);
        }}
        onConfirm={handleConfirmReflect}
        onUndo={onUndo}
        originalText={reviewMode === "section" && sectionReviewRequest ? sectionReviewRequest.sectionContent : content}
        newText={pendingRewrite || ""}
        isFullDocument={false}
      />
    </div>
  );
}
