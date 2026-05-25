"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clipboard,
  Lightbulb,
  Link2,
  LoaderCircle,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getLLMResultLabel } from "@/lib/ai/model-labels";
import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import { parseSimpleMarkdown, type SimpleMarkdownInline } from "@/lib/simple-markdown";
import type {
  ReviewPlaybackPhase,
  VisibleTemplateSource,
} from "@/features/es-review";

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
    repair_dispatch_count?: number;
    composite_retry_modes?: string[];
    final_acceptance_source?: "rewrite" | "safe_rewrite" | "degraded_best_effort";
    ai_smell_tier?: number;
    concrete_marker_count?: number;
    opening_conclusion_chars?: number;
    rewrite_sentence_count?: number;
  };
  onApply: (rewrite: string) => void;
  onPlaybackStateChange?: (isSettled: boolean) => void;
}

interface ParsedImprovementExplanation {
  improvement_points: Array<{ axis?: string; point: string; detail?: string }>;
  main_changes: Array<{ before_summary?: string; after_summary?: string; change?: string }>;
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

type SubmissionCheckStatus = "confirmed" | "needs_review" | "weak_evidence";

interface SubmissionCheckItem {
  label: string;
  status: SubmissionCheckStatus;
}

function getCheckStatus(points: number): SubmissionCheckStatus {
  if (points >= 4) return "confirmed";
  if (points >= 2) return "needs_review";
  return "weak_evidence";
}

function getEvidenceConstraintLabel(
  meta: StreamingReviewResponseProps["reviewMeta"],
): SubmissionCheckStatus {
  if (meta?.weak_evidence_notice) return "weak_evidence";

  switch (meta?.evidence_coverage_level) {
    case "strong":
    case "partial":
      return "confirmed";
    case "weak":
    case "none":
      return "weak_evidence";
    default:
      return "needs_review";
  }
}

function computeSubmissionChecks(
  meta: StreamingReviewResponseProps["reviewMeta"],
): SubmissionCheckItem[] | null {
  if (!meta) return null;

  const openingChars = meta.opening_conclusion_chars ?? 0;
  const sentenceCount = meta.rewrite_sentence_count ?? 0;
  let logicPoints = 0;
  if (openingChars >= 20 && openingChars <= 45) logicPoints += 3;
  else if (openingChars > 0 && openingChars <= 60) logicPoints += 2;
  if (sentenceCount >= 3) logicPoints += 2;
  else if (sentenceCount >= 2) logicPoints += 1;

  const concreteCount = meta.concrete_marker_count ?? 0;
  const smellTier = meta.ai_smell_tier ?? 0;
  let specPoints = 0;
  if (concreteCount >= 3) specPoints += 4;
  else if (concreteCount >= 2) specPoints += 3;
  else if (concreteCount >= 1) specPoints += 2;
  if (smellTier === 0) specPoints += 3;
  else if (smellTier === 1) specPoints += 1;

  const grounding = meta.grounding_mode ?? "none";
  const connectionStatus: SubmissionCheckStatus =
    grounding === "role_grounded"
      ? "confirmed"
      : grounding === "company_general"
        ? "needs_review"
        : "weak_evidence";

  return [
    { label: "構成", status: getCheckStatus(logicPoints) },
    { label: "具体性", status: getCheckStatus(specPoints) },
    { label: "企業接続", status: connectionStatus },
    { label: "根拠制約", status: getEvidenceConstraintLabel(meta) },
  ];
}

const CHECK_STATUS_STYLES: Record<SubmissionCheckStatus, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  needs_review: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  weak_evidence: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
};

const CHECK_STATUS_LABELS: Record<SubmissionCheckStatus, string> = {
  confirmed: "確認済み",
  needs_review: "要確認",
  weak_evidence: "根拠不足",
};

const SubmissionCheckBadges = memo(function SubmissionCheckBadges({
  checks,
}: {
  checks: SubmissionCheckItem[];
}) {
  return (
    <div className="flex items-center gap-2">
      {checks.map(({ label, status }) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            CHECK_STATUS_STYLES[status],
          )}
        >
          <span>{label}</span>
          <span className="font-bold">{CHECK_STATUS_LABELS[status]}</span>
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

function stripRawMarkdownHeadings(text: string): string {
  return text
    .replace(/^#{1,6}\s*(改善ポイント|変更箇所の解説)\s*$/gmu, "")
    .replace(/^#{1,6}\s*/gmu, "")
    .trim();
}

function parseImprovementExplanation(text: string): ParsedImprovementExplanation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<ParsedImprovementExplanation>;
    const improvementPoints = Array.isArray(parsed.improvement_points)
      ? parsed.improvement_points
          .map((item) => ({
            axis: typeof item.axis === "string" ? item.axis.trim() : "",
            point: typeof item.point === "string" ? item.point.trim() : "",
            detail: typeof item.detail === "string" ? item.detail.trim() : "",
          }))
          .filter((item) => item.point || item.detail)
          .slice(0, 3)
      : [];
    const mainChanges = Array.isArray(parsed.main_changes)
      ? parsed.main_changes
          .map((item) => ({
            before_summary: typeof item.before_summary === "string" ? item.before_summary.trim() : "",
            after_summary: typeof item.after_summary === "string" ? item.after_summary.trim() : "",
            change: typeof item.change === "string" ? item.change.trim() : "",
          }))
          .filter((item) => item.before_summary || item.after_summary || item.change)
          .slice(0, 2)
      : [];
    return improvementPoints.length || mainChanges.length
      ? { improvement_points: improvementPoints, main_changes: mainChanges }
      : null;
  } catch {
    return null;
  }
}

function ImprovementExplanation({
  text,
  showCursor,
}: {
  text: string;
  showCursor: boolean;
}) {
  const parsed = useMemo(() => parseImprovementExplanation(text), [text]);
  const fallbackText = useMemo(() => stripRawMarkdownHeadings(text), [text]);

  return (
    <Collapsible>
      <div className="rounded-2xl border border-border/60 bg-background/80">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="size-4 shrink-0 text-primary" />
            改善ポイント
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/60 px-4 py-4">
          {parsed ? (
            <div className="space-y-4">
              {parsed.improvement_points.length > 0 ? (
                <div className="space-y-2">
                  {parsed.improvement_points.map((point, index) => (
                    <div key={`${point.point}-${index}`} className="rounded-xl bg-muted/30 px-3 py-2">
                      <p className="text-sm font-medium text-foreground">
                        {point.axis ? `${point.axis}: ` : ""}
                        {point.point}
                      </p>
                      {point.detail ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{point.detail}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {parsed.main_changes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">主な変更点</p>
                  {parsed.main_changes.map((change, index) => (
                    <div key={`${change.before_summary}-${change.after_summary}-${index}`} className="rounded-xl border border-border/50 px-3 py-2">
                      {change.before_summary || change.after_summary ? (
                        <p className="text-xs leading-5 text-foreground">
                          {change.before_summary || "変更前"} → {change.after_summary || "変更後"}
                        </p>
                      ) : null}
                      {change.change ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{change.change}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <SimpleMarkdownText text={fallbackText} showCursor={showCursor} />
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function renderSimpleMarkdownInline(tokens: SimpleMarkdownInline[]) {
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    if (token.type === "strong") {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {token.text}
        </strong>
      );
    }
    if (token.type === "code") {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-medium">
          {token.text}
        </code>
      );
    }
    return <span key={key}>{token.text}</span>;
  });
}

function SimpleMarkdownText({
  text,
  showCursor,
}: {
  text: string;
  showCursor: boolean;
}) {
  const blocks = useMemo(() => parseSimpleMarkdown(text), [text]);

  return (
    <div className="space-y-2 break-words text-sm leading-7 text-foreground/90">
      {blocks.map((block, blockIndex) => {
        const isLastBlock = blockIndex === blocks.length - 1;
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={`block-${blockIndex}`}
              className={cn(
                "my-2 space-y-1.5 pl-4 text-sm leading-6",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${blockIndex}-${itemIndex}`}>
                  {renderSimpleMarkdownInline(item)}
                  {showCursor && isLastBlock && itemIndex === block.items.length - 1 ? (
                    <TypingCursor />
                  ) : null}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`block-${blockIndex}`}>
            {renderSimpleMarkdownInline(block.children)}
            {showCursor && isLastBlock ? <TypingCursor /> : null}
          </p>
        );
      })}
      {blocks.length === 0 && showCursor ? <TypingCursor /> : null}
    </div>
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
  const submissionChecks = useMemo(
    () => computeSubmissionChecks(reviewMeta),
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
        "rounded-[28px] border border-border/70 bg-background/96 p-4 shadow-sm sm:p-5",
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
              <h3 className="text-xl font-semibold leading-8 text-foreground">改善案</h3>
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
                      "提出条件をすべて満たせなかったため、最も近い改善案を表示しています。提出前に、文体（だ・である調）・指定字数・冒頭の結論の置き方を確認し、不足している点を直してください。"}
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
          <div className="rounded-[22px] border border-border/70 bg-muted/18 p-4">
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

        <div className="rounded-[24px] border border-border/70 bg-muted/12 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wand2 className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">改善案</p>
                <p className="text-xs text-muted-foreground">反映前に内容を確認できます。</p>
              </div>
            </div>
          </div>

          <div className="mt-4 min-h-[210px] rounded-[22px] border border-border/70 bg-background px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-5">
            {hasRewrite ? (
              <p className="whitespace-pre-wrap text-[0.95rem] leading-8 text-foreground">
                {visibleRewriteText}
                {isRewriteTyping && <TypingCursor />}
              </p>
            ) : (
              <RewriteSkeleton />
            )}
          </div>

          {showActions ? (
            <div className="mt-3 rounded-[22px] border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">反映準備</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isSettled
                      ? "内容を確認してからエディタへ反映できます。"
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

          {visibleExplanationText ? (
            <div className="mt-3">
              <ImprovementExplanation
                text={visibleExplanationText}
                showCursor={!explanationComplete}
              />
            </div>
          ) : null}
        </div>

        {isPlaybackComplete && submissionChecks ? (
          <Collapsible>
            <div className="rounded-2xl border border-border/60 bg-background/80">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-sm font-semibold text-foreground">提出前チェック</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/60 px-4 py-4">
                <SubmissionCheckBadges checks={submissionChecks} />
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}

        {sources.length > 0 ? (
          <Collapsible>
            <div className="rounded-[26px] border border-border/60 bg-background/88">
              <CollapsibleTrigger className="group flex w-full flex-wrap items-center justify-between gap-2 px-4 py-4 text-left sm:px-5">
                <span>
                  <span className="block text-sm font-semibold text-foreground">出典リンク</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    参照したユーザー情報・企業情報を確認できます。
                  </span>
                </span>
                <span className="flex items-center gap-2">
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  {sources.length}件
                </Badge>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent className="border-t border-border/60 px-4 pb-4 sm:px-5 sm:pb-5">
                <p className="mt-4 text-xs text-muted-foreground">
                  就活Passに保存したユーザー情報と、企業情報・関連資料の参照元です。プロフィールなど一部はアプリ内ページへ遷移します。
                </p>
                <div className="mt-4 grid gap-3">
                {sources.map((source, index) => (
                  <div key={`${source.source_url}-${index}`}>
                      <ReferenceSourceCard
                        title={source.title || source.content_type_label || "参考情報"}
                        meta={[source.content_type_label, source.domain].filter(Boolean).join(" / ")}
                        sourceUrl={source.source_url}
                        excerpt={renderTypedText(source.excerpt ?? "", isSourcesTyping && !source.isSettled, "muted")}
                      />
                  </div>
                ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}

      </div>
    </section>
  );
}
