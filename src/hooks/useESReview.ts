"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ProcessingStep } from "@/components/ui/EnhancedProcessingSteps";
import { trackEvent } from "@/lib/analytics/client";
import { calculateESReviewCost } from "@/lib/credits/cost";

export interface ReviewIssue {
  category: string;
  issue: string;
  suggestion: string;
  issue_id?: string;
  required_action?: string;
  must_appear?: string;
  priority_rank?: number;
  why_now?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface SectionData {
  title: string;
  content: string;
  charLimit?: number;
}

export type ReviewMode = "standard" | "qwen_beta";

export type TemplateType =
  | "basic"
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "self_pr"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  basic: "汎用ES添削",
  company_motivation: "志望理由",
  intern_reason: "インターン志望理由",
  intern_goals: "インターンでやりたいこと・学びたいこと",
  gakuchika: "ガクチカ",
  self_pr: "自己PR",
  post_join_goals: "入社してからやりたいこと",
  role_course_reason: "職種・コースを選択した理由",
  work_values: "働くうえで大切にしている価値観",
};

export const TEMPLATE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "company_motivation", label: "志望理由" },
  { value: "intern_reason", label: "インターン志望理由" },
  { value: "intern_goals", label: "インターンでやりたいこと・学びたいこと" },
  { value: "gakuchika", label: "ガクチカ" },
  { value: "self_pr", label: "自己PR" },
  { value: "post_join_goals", label: "入社してからやりたいこと" },
  { value: "role_course_reason", label: "職種・コースを選択した理由" },
  { value: "work_values", label: "働くうえで大切にしている価値観" },
];

export const COMPANYLESS_TEMPLATE_TYPES: TemplateType[] = ["gakuchika", "self_pr", "work_values"];

export const TEMPLATE_EXTRA_FIELDS: Record<TemplateType, string[]> = {
  basic: [],
  company_motivation: [],
  intern_reason: ["intern_name"],
  intern_goals: ["intern_name"],
  gakuchika: [],
  self_pr: [],
  post_join_goals: [],
  role_course_reason: [],
  work_values: [],
};

export const EXTRA_FIELD_LABELS: Record<string, string> = {
  intern_name: "インターン名",
  role_name: "職種・コース名",
};

export interface TemplateVariant {
  text: string;
  char_count: number;
  pros: string[];
  cons: string[];
  keywords_used: string[];
  keyword_sources: string[];
}

export interface TemplateSource {
  source_id: string;
  source_url: string;
  content_type: string;
  content_type_label?: string;
  title?: string;
  domain?: string;
  excerpt?: string;
}

export interface TemplateReview {
  template_type: TemplateType;
  variants: TemplateVariant[];
  keyword_sources: TemplateSource[];
}

export interface ReviewResult {
  top3: ReviewIssue[];
  rewrites: string[];
  template_review?: TemplateReview;
  review_meta?: {
    llm_provider?: string;
    llm_model?: string | null;
    review_variant?: string;
    grounding_mode?: "role_grounded" | "company_general" | "none";
    primary_role?: string;
    role_source?: string;
    triggered_enrichment?: boolean;
    enrichment_completed?: boolean;
    enrichment_sources_added?: number;
    reference_es_count?: number;
    reference_es_mode?: string;
    reference_quality_profile_used?: boolean;
    reference_outline_used?: boolean;
    company_grounding_policy?: "required" | "assistive";
    company_evidence_count?: number;
    evidence_coverage_level?: "none" | "weak" | "partial" | "strong";
    weak_evidence_notice?: boolean;
    injection_risk?: string | null;
    user_context_sources?: string[];
    hallucination_guard_mode?: "strict";
    fallback_to_generic?: boolean;
    length_policy?: "strict" | "soft_min_applied";
    length_shortfall?: number;
    length_fix_attempted?: boolean;
    length_fix_result?: "not_needed" | "strict_recovered" | "soft_min_applied" | "failed";
  };
}

export interface UseESReviewOptions {
  documentId: string;
}

export interface CurrentSectionInfo {
  title: string;
  charLimit?: number;
}

export interface SSEProgressState {
  currentStep: string | null;
  progress: number;
  steps: ProcessingStep[];
  isStreaming: boolean;
}

export interface SSEProgressEvent {
  type: "progress";
  step: string;
  progress: number;
  label?: string;
  subLabel?: string;
}

export interface SSECompleteEvent {
  type: "complete";
  result: ReviewResult;
  creditCost?: number;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
  error_type?: string;
}

export interface SSEFieldCompleteEvent {
  type: "field_complete";
  path: string;
  value: unknown;
}

export interface SSEArrayItemCompleteEvent {
  type: "array_item_complete";
  path: string;
  value: unknown;
}

export interface SSEChunkEvent {
  type: "chunk";
  text: string;
}

export interface SSEStringChunkEvent {
  type: "string_chunk";
  path: string;
  text: string;
}

export type SSEEvent =
  | SSEProgressEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEFieldCompleteEvent
  | SSEArrayItemCompleteEvent
  | SSEChunkEvent
  | SSEStringChunkEvent;

interface ReceivedReviewState {
  top3: ReviewIssue[];
  keywordSources: TemplateSource[];
  rewriteText: string;
}

export interface VisibleReviewIssue extends ReviewIssue {
  isSettled: boolean;
}

export interface VisibleTemplateSource extends TemplateSource {
  isSettled: boolean;
}

interface PlaybackReviewState {
  visibleRewriteText: string;
  visibleIssues: VisibleReviewIssue[];
  visibleSources: VisibleTemplateSource[];
}

export type ReviewPlaybackPhase = "idle" | "rewrite" | "issues" | "sources" | "complete";

export interface UseESReviewReturn {
  review: ReviewResult | null;
  visibleRewriteText: string;
  visibleIssues: VisibleReviewIssue[];
  visibleSources: VisibleTemplateSource[];
  finalRewriteText: string;
  playbackPhase: ReviewPlaybackPhase;
  isPlaybackComplete: boolean;
  isLoading: boolean;
  error: string | null;
  creditCost: number | null;
  currentSection: CurrentSectionInfo | null;
  cancelReview: () => void;
  isCancelling: boolean;
  elapsedTime: number;
  sseProgress: SSEProgressState;
  requestSectionReview: (params: {
    sectionTitle: string;
    sectionContent: string;
    sectionCharLimit?: number;
    hasCompanyRag?: boolean;
    companyId?: string;
    templateType?: TemplateType;
    internName?: string;
    roleName?: string;
    industryOverride?: string;
    roleSelectionSource?: string;
    reviewMode?: ReviewMode;
    llmModel?: string;
  }) => Promise<boolean>;
  clearReview: () => void;
}

const DEFAULT_SSE_STEPS: ProcessingStep[] = [
  { id: "validation", label: "入力内容を確認中...", subLabel: "設問と条件をチェック", duration: 1000 },
  { id: "rag_fetch", label: "企業情報を取得中...", subLabel: "関連情報を絞り込んでいます", duration: 8000 },
  { id: "analysis", label: "設問を分析中...", subLabel: "改善の優先度を整理しています", duration: 10000 },
  { id: "rewrite", label: "改善案を作成中...", subLabel: "伝わり方を整えています", duration: 8000 },
  { id: "finalize", label: "改善ポイントを整理しています...", subLabel: "優先順でまとめています", duration: 4000 },
  { id: "sources", label: "出典リンクを整理しています...", subLabel: "関連情報を最後に添えています", duration: 2000 },
];

const EMPTY_RECEIVED_REVIEW: ReceivedReviewState = {
  top3: [],
  keywordSources: [],
  rewriteText: "",
};

const EMPTY_PLAYBACK_REVIEW: PlaybackReviewState = {
  visibleRewriteText: "",
  visibleIssues: [],
  visibleSources: [],
};

function mergeStreamedItems<T>(streamedItems: T[], finalItems: T[]): T[] {
  if (streamedItems.length === 0) {
    return finalItems;
  }

  if (finalItems.length === 0) {
    return streamedItems;
  }

  const nextItems = [...streamedItems];
  for (let index = streamedItems.length; index < finalItems.length; index += 1) {
    nextItems[index] = finalItems[index];
  }
  return nextItems;
}

function upsertStreamItem<T>(items: T[], path: string, value: T): T[] {
  const index = Number.parseInt(path.split(".").at(-1) ?? "", 10);
  if (!Number.isFinite(index) || index < 0) {
    return [...items, value];
  }

  const nextItems = [...items];
  nextItems[index] = value;
  return nextItems.filter((item): item is T => item !== undefined);
}

function getRewriteCadence(targetText: string, currentLength: number) {
  const remaining = targetText.length - currentLength;
  const nextChunk = targetText.slice(currentLength, currentLength + 6);
  const hasHardPause = /[。！？]/.test(nextChunk);
  const hasSoftPause = /[、，：]/.test(nextChunk);

  return {
    step: remaining > 220 ? 8 : remaining > 120 ? 6 : 3,
    delay: hasHardPause ? 110 : hasSoftPause ? 78 : 48,
  };
}

function getReduceMotionPreference() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function derivePlaybackPhase(
  review: ReviewResult | null,
  playback: PlaybackReviewState,
  received: ReceivedReviewState,
  isLoading: boolean,
): ReviewPlaybackPhase {
  const hasVisibleContent =
    playback.visibleRewriteText.length > 0 ||
    playback.visibleIssues.length > 0 ||
    playback.visibleSources.length > 0;

  if (!isLoading && !review && !hasVisibleContent) {
    return "idle";
  }

  if (
    isLoading ||
    playback.visibleRewriteText.length < received.rewriteText.length ||
    (received.rewriteText.length === 0 && !review)
  ) {
    return "rewrite";
  }

  const issuesSettled =
    playback.visibleIssues.length >= received.top3.length &&
    playback.visibleIssues.every((issue, index) => {
      const targetIssue = received.top3[index];
      return targetIssue ? isVisibleIssueSettled(issue, targetIssue) : true;
    });

  if (!issuesSettled) {
    return "issues";
  }

  const sourcesSettled =
    playback.visibleSources.length >= received.keywordSources.length &&
    playback.visibleSources.every((source, index) => {
      const targetSource = received.keywordSources[index];
      return targetSource ? isVisibleSourceSettled(source, targetSource) : true;
    });

  if (!sourcesSettled) {
    return "sources";
  }

  return review ? "complete" : "sources";
}

function createVisibleIssue(issue: ReviewIssue): VisibleReviewIssue {
  return {
    ...issue,
    issue: "",
    suggestion: "",
    why_now: "",
    isSettled: false,
  };
}

function createVisibleSource(source: TemplateSource): VisibleTemplateSource {
  return {
    ...source,
    excerpt: "",
    isSettled: !(source.excerpt ?? "").length,
  };
}

function isVisibleIssueSettled(visible: VisibleReviewIssue, target: ReviewIssue): boolean {
  return visible.issue === target.issue && visible.suggestion === target.suggestion;
}

function isVisibleSourceSettled(visible: VisibleTemplateSource, target: TemplateSource): boolean {
  return (visible.excerpt ?? "") === (target.excerpt ?? "");
}

function getIssuePlaybackStage(visible: VisibleReviewIssue, target: ReviewIssue) {
  const fields = [
    { key: "issue", value: target.issue },
    { key: "suggestion", value: target.suggestion },
  ] as const;

  for (const field of fields) {
    const currentValue = visible[field.key] ?? "";
    if (currentValue.length < field.value.length) {
      return {
        key: field.key,
        currentValue,
        targetValue: field.value,
      };
    }
  }

  return null;
}

function getSourcePlaybackStage(visible: VisibleTemplateSource, target: TemplateSource) {
  const targetValue = target.excerpt ?? "";
  const currentValue = visible.excerpt ?? "";

  if (currentValue.length < targetValue.length) {
    return {
      key: "excerpt" as const,
      currentValue,
      targetValue,
    };
  }

  return null;
}

export function useESReview({ documentId }: UseESReviewOptions): UseESReviewReturn {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState<number | null>(null);
  const [currentSection, setCurrentSection] = useState<CurrentSectionInfo | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [receivedReview, setReceivedReview] = useState<ReceivedReviewState>(EMPTY_RECEIVED_REVIEW);
  const [playbackReview, setPlaybackReview] = useState<PlaybackReviewState>(EMPTY_PLAYBACK_REVIEW);
  const [sseProgress, setSSEProgress] = useState<SSEProgressState>({
    currentStep: null,
    progress: 0,
    steps: DEFAULT_SSE_STEPS,
    isStreaming: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelReview = useCallback(() => {
    if (abortControllerRef.current && isLoading) {
      setIsCancelling(true);
      abortControllerRef.current.abort();
    }
  }, [isLoading]);

  const parseSSEEvent = useCallback((text: string): SSEEvent | null => {
    try {
      const dataMatch = text.match(/^data:\s*(.+)$/m);
      if (!dataMatch) {
        return null;
      }
      return JSON.parse(dataMatch[1]) as SSEEvent;
    } catch {
      console.warn("Failed to parse SSE event:", text);
      return null;
    }
  }, []);

  const resetStreamingState = useCallback(() => {
    setReceivedReview(EMPTY_RECEIVED_REVIEW);
    setPlaybackReview(EMPTY_PLAYBACK_REVIEW);
    setSSEProgress({
      currentStep: null,
      progress: 0,
      steps: DEFAULT_SSE_STEPS,
      isStreaming: false,
    });
  }, []);

  const clearReview = useCallback(() => {
    requestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    clearTimer();
    setReview(null);
    setError(null);
    setCreditCost(null);
    setCurrentSection(null);
    setIsLoading(false);
    setIsCancelling(false);
    setElapsedTime(0);
    resetStreamingState();
  }, [clearTimer, resetStreamingState]);

  const requestSectionReview = useCallback(
    async (params: {
      sectionTitle: string;
      sectionContent: string;
      sectionCharLimit?: number;
      hasCompanyRag?: boolean;
      companyId?: string;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
      industryOverride?: string;
      roleSelectionSource?: string;
      reviewMode?: ReviewMode;
      llmModel?: string;
    }): Promise<boolean> => {
      const effectiveReviewMode = params.reviewMode ?? "standard";
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const isActiveRequest = () => requestIdRef.current === requestId;
      const expectedCreditCost = calculateESReviewCost(params.sectionContent.length);

      setReview(null);
      setIsLoading(true);
      setError(null);
      setCreditCost(null);
      setIsCancelling(false);
      setElapsedTime(0);
      setCurrentSection({
        title: params.sectionTitle,
        charLimit: params.sectionCharLimit,
      });
      setReceivedReview(EMPTY_RECEIVED_REVIEW);
      setPlaybackReview(EMPTY_PLAYBACK_REVIEW);
      setSSEProgress({
        currentStep: null,
        progress: 0,
        steps: DEFAULT_SSE_STEPS,
        isStreaming: true,
      });

      clearTimer();
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        if (!isActiveRequest()) {
          return;
        }
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        trackEvent("ai_review_start", {
          templateType: params.templateType ?? null,
          hasCompanyRag: params.hasCompanyRag ?? false,
          reviewMode: effectiveReviewMode,
        });

        const streamPath =
          effectiveReviewMode === "qwen_beta"
            ? `/api/documents/${documentId}/review/qwen-stream`
            : `/api/documents/${documentId}/review/stream`;
        const response = await fetch(streamPath, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            content: params.sectionContent,
            hasCompanyRag: params.hasCompanyRag || false,
            companyId: params.companyId,
            sectionTitle: params.sectionTitle,
            sectionCharLimit: params.sectionCharLimit,
            templateType: params.templateType,
            internName: params.internName,
            roleName: params.roleName,
            industryOverride: params.industryOverride,
            roleSelectionSource: params.roleSelectionSource,
            llmModel: params.llmModel,
          }),
        });

        if (!isActiveRequest()) {
          return false;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (!isActiveRequest()) {
            return false;
          }

          if (response.status === 402) {
            setError(`クレジットが不足しています（必要: ${data.creditCost}クレジット）`);
          } else if (response.status === 401) {
            setError(data.error || "ログインが必要です");
          } else {
            setError(data.error || "添削リクエストに失敗しました");
          }
          trackEvent("ai_review_error", {
            status: response.status,
            reviewMode: effectiveReviewMode,
          });
          return false;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError("ストリーミングがサポートされていません");
          return false;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let receivedComplete = false;

        while (true) {
          const { done, value } = await reader.read();

          if (!isActiveRequest()) {
            return false;
          }

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventText of events) {
            if (!eventText.trim()) {
              continue;
            }

            const event = parseSSEEvent(eventText);
            if (!event || !isActiveRequest()) {
              continue;
            }

            switch (event.type) {
              case "progress":
                setSSEProgress((prev) => ({
                  ...prev,
                  currentStep: event.step,
                  progress: event.progress,
                  steps: event.label
                    ? prev.steps.map((step) =>
                        step.id === event.step
                          ? { ...step, label: event.label!, subLabel: event.subLabel }
                          : step,
                      )
                    : prev.steps,
                }));
                break;

              case "field_complete":
                if (event.path === "streaming_rewrite" && typeof event.value === "string") {
                  const rewriteText = event.value;
                  setReceivedReview((prev) => ({
                    ...prev,
                    rewriteText:
                      rewriteText.length > prev.rewriteText.length
                        ? rewriteText
                        : prev.rewriteText,
                  }));
                }
                break;

              case "array_item_complete":
                if (event.path.startsWith("top3.")) {
                  setReceivedReview((prev) => ({
                    ...prev,
                    top3: upsertStreamItem(prev.top3, event.path, event.value as ReviewIssue),
                  }));
                } else if (event.path.startsWith("keyword_sources.")) {
                  setReceivedReview((prev) => ({
                    ...prev,
                    keywordSources: upsertStreamItem(
                      prev.keywordSources,
                      event.path,
                      event.value as TemplateSource,
                    ),
                  }));
                }
                break;

              case "string_chunk":
                if (event.path === "streaming_rewrite") {
                  setReceivedReview((prev) => ({
                    ...prev,
                    rewriteText: prev.rewriteText + event.text,
                  }));
                }
                break;

              case "complete":
                receivedComplete = true;
                setReview(event.result);
                setCreditCost(event.creditCost ?? expectedCreditCost);
                setReceivedReview((prev) => {
                  const finalRewrite = event.result.rewrites[0] ?? prev.rewriteText;
                  const finalSources = event.result.template_review?.keyword_sources ?? [];
                  return {
                    top3: mergeStreamedItems(prev.top3, event.result.top3),
                    keywordSources: mergeStreamedItems(prev.keywordSources, finalSources),
                    rewriteText:
                      finalRewrite.length > prev.rewriteText.length
                        ? finalRewrite
                        : prev.rewriteText,
                  };
                });
                trackEvent("ai_review_complete", {
                  templateType: params.templateType ?? null,
                  creditCost: event.creditCost ?? expectedCreditCost,
                  reviewMode: effectiveReviewMode,
                });
                setSSEProgress((prev) => ({
                  ...prev,
                  progress: 100,
                  isStreaming: false,
                }));
                return true;

              case "error":
                setError(event.message || "添削処理でエラーが発生しました");
                trackEvent("ai_review_error", { reviewMode: effectiveReviewMode });
                return false;

              case "chunk":
                break;
            }
          }
        }

        if (!receivedComplete) {
          setError("添削結果を受信できませんでした");
          return false;
        }

        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          if (isActiveRequest()) {
            setError(null);
            setIsCancelling(false);
          }
          return false;
        }

        if (isActiveRequest()) {
          console.error("Review request error:", err);
          setError("ネットワークエラーが発生しました");
          trackEvent("ai_review_error", { reviewMode: effectiveReviewMode });
        }
        return false;
      } finally {
        if (!isActiveRequest()) {
          return false;
        }

        clearTimer();
        setIsLoading(false);
        setIsCancelling(false);
        setSSEProgress((prev) => ({ ...prev, isStreaming: false }));
        abortControllerRef.current = null;
      }
    },
    [clearTimer, documentId, parseSSEEvent],
  );

  useEffect(() => {
    const targetText = receivedReview.rewriteText;
    const visibleText = playbackReview.visibleRewriteText;

    if (!targetText || visibleText.length >= targetText.length) {
      return;
    }

    if (getReduceMotionPreference()) {
      startTransition(() => {
        setPlaybackReview((prev) => ({
          ...prev,
          visibleRewriteText: targetText,
        }));
      });
      return;
    }

    const { step, delay } = getRewriteCadence(targetText, visibleText.length);
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextLength = Math.min(targetText.length, prev.visibleRewriteText.length + step);
          return {
            ...prev,
            visibleRewriteText: targetText.slice(0, nextLength),
          };
        });
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [playbackReview.visibleRewriteText, receivedReview.rewriteText]);

  useEffect(() => {
    const rewriteSettled =
      playbackReview.visibleRewriteText.length >= receivedReview.rewriteText.length;

    if (!rewriteSettled || playbackReview.visibleIssues.length >= receivedReview.top3.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextIssue = receivedReview.top3[prev.visibleIssues.length];
          if (!nextIssue) {
            return prev;
          }

          return {
            ...prev,
            visibleIssues: [...prev.visibleIssues, createVisibleIssue(nextIssue)],
          };
        });
      });
    }, getReduceMotionPreference() ? 0 : 160);

    return () => window.clearTimeout(timer);
  }, [
    playbackReview.visibleIssues,
    playbackReview.visibleRewriteText.length,
    receivedReview.rewriteText.length,
    receivedReview.top3,
  ]);

  useEffect(() => {
    const nextIssueIndex = playbackReview.visibleIssues.findIndex((issue, index) => {
      const targetIssue = receivedReview.top3[index];
      return targetIssue ? !isVisibleIssueSettled(issue, targetIssue) : false;
    });

    if (nextIssueIndex < 0) {
      return;
    }

    const targetIssue = receivedReview.top3[nextIssueIndex];
    const visibleIssue = playbackReview.visibleIssues[nextIssueIndex];
    const nextStage = getIssuePlaybackStage(visibleIssue, targetIssue);

    if (getReduceMotionPreference()) {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextIssues = [...prev.visibleIssues];
          nextIssues[nextIssueIndex] = {
            ...targetIssue,
            isSettled: true,
          };
          return {
            ...prev,
            visibleIssues: nextIssues,
          };
        });
      });
      return;
    }

    if (!nextStage) {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          setPlaybackReview((prev) => {
            const nextIssues = [...prev.visibleIssues];
            nextIssues[nextIssueIndex] = {
              ...prev.visibleIssues[nextIssueIndex],
              isSettled: true,
            };
            return {
              ...prev,
              visibleIssues: nextIssues,
            };
          });
        });
      }, 90);

      return () => window.clearTimeout(timer);
    }

    const { step, delay } = getRewriteCadence(nextStage.targetValue, nextStage.currentValue.length);
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => ({
          ...prev,
          visibleIssues: prev.visibleIssues.map((issue, index) => {
            if (index !== nextIssueIndex) {
              return issue;
            }

            const nextLength = Math.min(
              nextStage.targetValue.length,
              (issue[nextStage.key] ?? "").length + step,
            );

            return {
              ...issue,
              [nextStage.key]: nextStage.targetValue.slice(0, nextLength),
              isSettled: false,
            };
          }),
        }));
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    playbackReview.visibleIssues,
    playbackReview.visibleRewriteText.length,
    receivedReview.rewriteText.length,
    receivedReview.top3,
  ]);

  useEffect(() => {
    const rewriteSettled =
      playbackReview.visibleRewriteText.length >= receivedReview.rewriteText.length;
    const issuesSettled =
      playbackReview.visibleIssues.length >= receivedReview.top3.length &&
      playbackReview.visibleIssues.every((issue, index) => {
        const targetIssue = receivedReview.top3[index];
        return targetIssue ? isVisibleIssueSettled(issue, targetIssue) : true;
      });

    if (
      !rewriteSettled ||
      !issuesSettled ||
      playbackReview.visibleSources.length >= receivedReview.keywordSources.length
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextSource = receivedReview.keywordSources[prev.visibleSources.length];
          if (!nextSource) {
            return prev;
          }

          return {
            ...prev,
            visibleSources: [...prev.visibleSources, createVisibleSource(nextSource)],
          };
        });
      });
    }, getReduceMotionPreference() ? 0 : 140);

    return () => window.clearTimeout(timer);
  }, [
    playbackReview.visibleIssues,
    playbackReview.visibleRewriteText.length,
    playbackReview.visibleSources.length,
    receivedReview.keywordSources,
    receivedReview.rewriteText.length,
    receivedReview.top3,
  ]);

  useEffect(() => {
    const nextSourceIndex = playbackReview.visibleSources.findIndex((source, index) => {
      const targetSource = receivedReview.keywordSources[index];
      return targetSource ? !isVisibleSourceSettled(source, targetSource) : false;
    });

    if (nextSourceIndex < 0) {
      return;
    }

    const targetSource = receivedReview.keywordSources[nextSourceIndex];
    const visibleSource = playbackReview.visibleSources[nextSourceIndex];
    const nextStage = getSourcePlaybackStage(visibleSource, targetSource);

    if (getReduceMotionPreference()) {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextSources = [...prev.visibleSources];
          nextSources[nextSourceIndex] = {
            ...targetSource,
            isSettled: true,
          };
          return {
            ...prev,
            visibleSources: nextSources,
          };
        });
      });
      return;
    }

    if (!nextStage) {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          setPlaybackReview((prev) => {
            const nextSources = [...prev.visibleSources];
            nextSources[nextSourceIndex] = {
              ...prev.visibleSources[nextSourceIndex],
              isSettled: true,
            };
            return {
              ...prev,
              visibleSources: nextSources,
            };
          });
        });
      }, 90);

      return () => window.clearTimeout(timer);
    }

    const { step, delay } = getRewriteCadence(nextStage.targetValue, nextStage.currentValue.length);
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => ({
          ...prev,
          visibleSources: prev.visibleSources.map((source, index) => {
            if (index !== nextSourceIndex) {
              return source;
            }

            const nextLength = Math.min(
              nextStage.targetValue.length,
              (source.excerpt ?? "").length + step,
            );

            return {
              ...source,
              excerpt: nextStage.targetValue.slice(0, nextLength),
              isSettled: false,
            };
          }),
        }));
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [playbackReview.visibleSources, receivedReview.keywordSources]);

  const finalRewriteText = review?.rewrites[0] ?? receivedReview.rewriteText;
  const playbackPhase = derivePlaybackPhase(review, playbackReview, receivedReview, isLoading);
  const isPlaybackComplete =
    Boolean(review) &&
    playbackReview.visibleRewriteText.length >= receivedReview.rewriteText.length &&
    playbackReview.visibleIssues.length >= receivedReview.top3.length &&
    playbackReview.visibleSources.length >= receivedReview.keywordSources.length &&
    playbackReview.visibleIssues.every((issue, index) => {
      const targetIssue = receivedReview.top3[index];
      return targetIssue ? isVisibleIssueSettled(issue, targetIssue) : true;
    }) &&
    playbackReview.visibleSources.every((source, index) => {
      const targetSource = receivedReview.keywordSources[index];
      return targetSource ? isVisibleSourceSettled(source, targetSource) : true;
    });

  return {
    review,
    visibleRewriteText: playbackReview.visibleRewriteText,
    visibleIssues: playbackReview.visibleIssues,
    visibleSources: playbackReview.visibleSources,
    finalRewriteText,
    playbackPhase,
    isPlaybackComplete,
    isLoading,
    error,
    creditCost,
    currentSection,
    cancelReview,
    isCancelling,
    elapsedTime,
    sseProgress,
    requestSectionReview,
    clearReview,
  };
}
