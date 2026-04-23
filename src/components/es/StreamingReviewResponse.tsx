"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Clipboard,
  Link2,
  LoaderCircle,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLLMResultLabel } from "@/lib/ai/model-labels";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import type {
  ReviewPlaybackPhase,
  VisibleTemplateSource,
} from "@/hooks/useESReview";

interface StreamingReviewResponseProps {
  visibleRewriteText: string;
  explanationText?: string;
  explanationComplete?: boolean;
  finalRewriteText?: string;
  sources: VisibleTemplateSource[];
  charLimit?: number;
  templateLabel?: string;
  isStreaming?: boolean;
  playbackPhase: ReviewPlaybackPhase;
  isPlaybackComplete?: boolean;
  progressTitle?: string;
  progressDescription?: string;
  progressPercent?: number;
  elapsedTime?: number;
  showActions?: boolean;
  className?: string;
  reviewMeta?: {
    llm_provider?: string;
    llm_model?: string | null;
    llm_model_alias?: string | null;
    review_variant?: string;
    grounding_mode?: "role_grounded" | "company_general" | "none";
    primary_role?: string;
    reference_es_count?: number;
    evidence_coverage_level?: "not_applicable" | "none" | "weak" | "partial" | "strong";
    weak_evidence_notice?: boolean;
    rewrite_validation_status?: "strict_ok" | "soft_ok" | "degraded";
    rewrite_validation_user_hint?: string | null;
    ai_smell_tier?: number;
    concrete_marker_count?: number;
    opening_conclusion_chars?: number;
    rewrite_sentence_count?: number;
  };
  onApply: (rewrite: string) => void;
  onPlaybackStateChange?: (isSettled: boolean) => void;
}

function CharacterStats({
  charCount,
  charLimit,
}: {
  charCount: number;
  charLimit?: number;
}) {
  const isOver = typeof charLimit === "number" && charCount > charLimit;

  return (
    <Badge variant={isOver ? "soft-destructive" : "soft-info"} className="px-3 py-1 text-[11px]">
      {charCount}字
      {typeof charLimit === "number" ? ` / ${charLimit}字` : ""}
    </Badge>
  );
}

function ProgressChip({
  playbackPhase,
  isStreaming,
}: {
  playbackPhase: ReviewPlaybackPhase;
  isStreaming: boolean;
}) {
  if (!isStreaming && playbackPhase === "complete") {
    return (
      <Badge variant="soft-success" className="gap-1 px-3 py-1 text-[11px]">
        <Check className="size-3.5" />
        添削完了
      </Badge>
    );
  }

  if (playbackPhase === "sources") {
    return (
      <Badge variant="soft-info" className="gap-1 px-3 py-1 text-[11px]">
        <Link2 className="size-3.5" />
        出典を整理中
      </Badge>
    );
  }

  return (
    <Badge variant="soft-primary" className="gap-1 px-3 py-1 text-[11px]">
      <LoaderCircle className="size-3.5 animate-spin" />
      改善した回答を提案中
    </Badge>
  );
}

function getReviewProviderLabel(reviewMeta?: StreamingReviewResponseProps["reviewMeta"]) {
  return getLLMResultLabel({
    provider: reviewMeta?.llm_provider,
    modelId: reviewMeta?.llm_model,
    modelAlias: reviewMeta?.llm_model_alias,
    reviewVariant: reviewMeta?.review_variant,
  });
}

type QualityGrade = "S" | "A" | "B" | "C";

interface QualityScores {
  logic: QualityGrade;
  specificity: QualityGrade;
  companyFit: QualityGrade;
}

function computeQualityScores(
  meta: StreamingReviewResponseProps["reviewMeta"],
): QualityScores | null {
  if (!meta) return null;

  // Logic score: opening conclusion length + sentence count + rewrite attempts
  const openingChars = meta.opening_conclusion_chars ?? 0;
  const attempts = (meta as Record<string, unknown>).rewrite_attempt_count as number | undefined ?? 1;
  const sentenceCount = meta.rewrite_sentence_count ?? 0;
  let logicPoints = 0;
  if (openingChars >= 20 && openingChars <= 45) logicPoints += 3;
  else if (openingChars > 0 && openingChars <= 60) logicPoints += 2;
  if (sentenceCount >= 3) logicPoints += 2;
  else if (sentenceCount >= 2) logicPoints += 1;
  if (attempts <= 1) logicPoints += 2;
  else if (attempts <= 2) logicPoints += 1;
  const logic: QualityGrade =
    logicPoints >= 6 ? "S" : logicPoints >= 4 ? "A" : logicPoints >= 2 ? "B" : "C";

  // Specificity score: concrete markers + AI smell tier
  const concreteCount = meta.concrete_marker_count ?? 0;
  const smellTier = meta.ai_smell_tier ?? 0;
  let specPoints = 0;
  if (concreteCount >= 3) specPoints += 4;
  else if (concreteCount >= 2) specPoints += 3;
  else if (concreteCount >= 1) specPoints += 2;
  if (smellTier === 0) specPoints += 3;
  else if (smellTier === 1) specPoints += 1;
  const specificity: QualityGrade =
    specPoints >= 6 ? "S" : specPoints >= 4 ? "A" : specPoints >= 2 ? "B" : "C";

  // Company Fit score: grounding mode + evidence coverage
  const grounding = meta.grounding_mode ?? "none";
  const coverage = meta.evidence_coverage_level ?? "none";
  let fitPoints = 0;
  if (grounding === "role_grounded") fitPoints += 4;
  else if (grounding === "company_general") fitPoints += 2;
  if (coverage === "strong") fitPoints += 3;
  else if (coverage === "partial") fitPoints += 2;
  else if (coverage === "weak") fitPoints += 1;
  const companyFit: QualityGrade =
    fitPoints >= 6 ? "S" : fitPoints >= 4 ? "A" : fitPoints >= 2 ? "B" : "C";

  return { logic, specificity, companyFit };
}

const GRADE_COLORS: Record<QualityGrade, string> = {
  S: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  B: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  C: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300",
};

const QualityScoreBadges = memo(function QualityScoreBadges({
  scores,
}: {
  scores: QualityScores;
}) {
  const axes = [
    { label: "論理性", grade: scores.logic },
    { label: "具体性", grade: scores.specificity },
    { label: "企業適合", grade: scores.companyFit },
  ] as const;

  return (
    <div className="flex items-center gap-2">
      {axes.map(({ label, grade }) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            GRADE_COLORS[grade],
          )}
        >
          <span>{label}</span>
          <span className="font-bold">{grade}</span>
        </div>
      ))}
    </div>
  );
});

function RewriteSkeleton() {
  return (
    <div className="space-y-3">
      {["72%", "94%", "83%", "58%"].map((width, index) => (
        <div
          key={width}
          className={cn(
            "h-3.5 rounded-full bg-primary/10",
            index === 0 ? "mt-1" : undefined,
          )}
          style={{ width }}
        />
      ))}
    </div>
  );
}

function TypingCursor() {
  return <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/55 align-middle" />;
}

function renderTypedText(text: string, isActive: boolean, tone: "default" | "muted" = "default") {
  return (
    <p className={tone === "muted" ? "text-sm leading-6 text-muted-foreground" : "text-sm leading-6 text-foreground"}>
      {text || <span className="opacity-0">.</span>}
      {isActive ? <TypingCursor /> : null}
    </p>
  );
}

export function StreamingReviewResponse({
  visibleRewriteText,
  explanationText = "",
  explanationComplete = false,
  finalRewriteText,
  sources,
  charLimit,
  templateLabel,
  isStreaming = false,
  playbackPhase,
  isPlaybackComplete = false,
  progressTitle,
  progressDescription,
  progressPercent = 0,
  elapsedTime = 0,
  showActions = false,
  className,
  reviewMeta,
  onApply,
  onPlaybackStateChange,
}: StreamingReviewResponseProps) {
  const [copied, setCopied] = useState(false);

  const normalizedFinalRewrite = finalRewriteText?.trim() ?? "";
  const rewriteForActions = normalizedFinalRewrite || visibleRewriteText.trim();
  const hasRewrite = visibleRewriteText.trim().length > 0;
  const visibleExplanationText = explanationText;
  const isSettled = showActions && isPlaybackComplete;
  const showProgress = isStreaming || (showActions && !isSettled);
  const isRewriteTyping = playbackPhase === "rewrite";
  const isSourcesTyping = playbackPhase === "sources";
  const visualProgressPercent = isSettled
    ? 100
    : isStreaming
      ? Math.min(progressPercent, 96)
      : 98;
  const rewriteCharCount = (rewriteForActions || visibleRewriteText).trim().length;
  const providerLabel = getReviewProviderLabel(reviewMeta);
  const qualityScores = useMemo(
    () => computeQualityScores(reviewMeta),
    [reviewMeta],
  );

  useEffect(() => {
    onPlaybackStateChange?.(isSettled);
  }, [isSettled, onPlaybackStateChange]);

  const handleCopy = async () => {
    if (!rewriteForActions) {
      return;
    }

    try {
      await navigator.clipboard.writeText(rewriteForActions);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to copy rewrite text:", err);
    }
  };

  return (
    <section
      className={cn(
        "rounded-[30px] border border-border/70 bg-background p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft-primary" className="gap-1.5 px-3 py-1 text-[11px]">
                <Sparkles className="size-3.5" />
                AI添削
              </Badge>
              {providerLabel ? (
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  {providerLabel}
                </Badge>
              ) : null}
              <ProgressChip playbackPhase={playbackPhase} isStreaming={isStreaming} />
              {templateLabel ? (
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  {templateLabel}
                </Badge>
              ) : null}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">改善案</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                改善した回答と出典リンクをこの順で表示します。
              </p>
              {reviewMeta?.grounding_mode === "company_general" && reviewMeta.primary_role ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  企業情報は参照していますが、{reviewMeta.primary_role}向けの根拠は限定的です。職種別の断定表現は抑えて添削しています。
                </p>
              ) : null}
              {reviewMeta?.weak_evidence_notice ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  今回は企業根拠が{reviewMeta.evidence_coverage_level === "none" ? "ほぼ取れていない" : "まだ薄い"}ため、
                  企業固有の断定を広げず安全寄りに添削しています。
                </p>
              ) : null}
              {reviewMeta?.rewrite_validation_status === "soft_ok" ? (
                <p className="mt-2 flex items-start gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs leading-5 text-sky-950 dark:text-sky-100">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span>
                    {reviewMeta.rewrite_validation_user_hint?.trim() ||
                      "一部条件を緩和して表示しています。提出前に文字数・文体・企業接続を確認してください。"}
                  </span>
                </p>
              ) : null}
              {reviewMeta?.rewrite_validation_status === "degraded" ? (
                <p className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs leading-5 text-amber-950 dark:text-amber-100">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    {reviewMeta.rewrite_validation_user_hint?.trim() ||
                      "厳密な品質チェックをすべて満たせませんでしたが、最も近い改善案を表示しています。提出前に、文体（だ・である調）・指定字数・冒頭の結論の置き方を確認し、不足している点を直してください。"}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {rewriteCharCount > 0 ? (
            <CharacterStats charCount={rewriteCharCount} charLimit={charLimit} />
          ) : null}
        </div>

        {showProgress ? (
          <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {progressTitle || "改善した回答を整えています"}
                {elapsedTime > 0 ? ` (${elapsedTime}秒)` : ""}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {progressDescription || "結果を順に表示しています。"}
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(10, visualProgressPercent)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-[26px] border border-border/70 bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wand2 className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">改善案</p>
                <p className="text-xs text-muted-foreground">反映前に内容を確認できます。</p>
              </div>
            </div>
          </div>

          <div className="mt-4 min-h-[190px] rounded-[22px] border border-border/70 bg-background px-4 py-4 sm:px-5">
            {hasRewrite ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                {visibleRewriteText}
                {isRewriteTyping && <TypingCursor />}
              </p>
            ) : (
              <RewriteSkeleton />
            )}
          </div>

          {visibleExplanationText ? (
            <div className="mt-3 rounded-2xl border border-border/50 bg-muted/10 p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .75.75h2.5a.75.75 0 0 0 .75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.563 7.563 0 0 1-2.274 0Z" />
                </svg>
                改善ポイント
              </h4>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {visibleExplanationText}
                {!explanationComplete ? <TypingCursor /> : null}
              </div>
            </div>
          ) : null}
        </div>

        {isPlaybackComplete && qualityScores ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">品質スコア</p>
            <QualityScoreBadges scores={qualityScores} />
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="rounded-[26px] border border-border/60 bg-background/88 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">出典リンク</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    就活Passに保存したユーザー情報と、企業情報・関連資料の参照元です。プロフィールなど一部はアプリ内ページへ遷移します。
                  </p>
                </div>
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  {sources.length}件
                </Badge>
              </div>

              <div className="mt-4 grid gap-3">
                {sources.map((source, index) => (
                  <div key={`${source.source_id}-${index}`}>
                      <ReferenceSourceCard
                        title={source.title || source.content_type_label || "参考情報"}
                        meta={[source.content_type_label, source.domain].filter(Boolean).join(" / ")}
                        sourceUrl={source.source_url}
                        excerpt={renderTypedText(source.excerpt ?? "", isSourcesTyping && !source.isSettled, "muted")}
                      />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

        {showActions ? (
          <div className="rounded-[24px] border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">反映準備</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSettled
                    ? "添削が完了しました。内容を確認してから反映できます。"
                    : "表示を整えてから反映ボタンを有効にします。"}
                </p>
              </div>
              {!isSettled ? (
                <Badge variant="soft-warning" className="px-3 py-1 text-[11px]">
                  表示待機中
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-11 rounded-full gap-1.5"
                disabled={!rewriteForActions}
              >
                {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                {copied ? "コピー済み" : "改善案をコピー"}
              </Button>
              <Button
                size="sm"
                onClick={() => onApply(rewriteForActions)}
                className="h-11 rounded-full gap-1.5"
                disabled={!isSettled || !rewriteForActions}
              >
                <Sparkles className="size-4" />
                この改善案を反映
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
