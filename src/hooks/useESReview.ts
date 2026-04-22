"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics/client";
import type { StandardESReviewModel } from "@/lib/ai/es-review-models";
import { calculateESReviewCost } from "@/lib/credits/cost";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import type {
  CurrentSectionInfo,
  ReviewMode,
  ReviewResult,
  SSEEvent,
  SSEProgressState,
  TemplateSource,
  TemplateType,
  UseESReviewOptions,
  UseESReviewReturn,
} from "./es-review/types";
import { createSSESteps } from "./es-review/sse-steps";
import { consumeESReviewStream } from "./es-review/transport";
import {
  createVisibleSource,
  derivePlaybackPhase,
  EMPTY_PLAYBACK_REVIEW,
  EMPTY_RECEIVED_REVIEW,
  getReduceMotionPreference,
  getRewriteCadence,
  getSourcePlaybackStage,
  isVisibleSourceSettled,
  mergeStreamedItems,
  type ReceivedReviewState,
  upsertStreamItem,
} from "./es-review/playback";

export type {
  CurrentSectionInfo,
  ReviewMode,
  ReviewPlaybackPhase,
  ReviewResult,
  SectionData,
  SSEArrayItemCompleteEvent,
  SSEChunkEvent,
  SSECompleteEvent,
  SSEErrorEvent,
  SSEEvent,
  SSEFieldCompleteEvent,
  SSEProgressEvent,
  SSEProgressState,
  SSEStringChunkEvent,
  TemplateReview,
  TemplateSource,
  TemplateType,
  TemplateVariant,
  UseESReviewOptions,
  UseESReviewReturn,
  VisibleTemplateSource,
} from "./es-review/types";

export {
  EXTRA_FIELD_LABELS,
  TEMPLATE_EXTRA_FIELDS,
  TEMPLATE_LABELS,
  TEMPLATE_OPTIONS,
} from "./es-review/template-meta";

export function useESReview({ documentId, esReviewBillingPlan }: UseESReviewOptions): UseESReviewReturn {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState<number | null>(null);
  const [currentSection, setCurrentSection] = useState<CurrentSectionInfo | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [receivedReview, setReceivedReview] = useState<ReceivedReviewState>(EMPTY_RECEIVED_REVIEW);
  const [playbackReview, setPlaybackReview] = useState(EMPTY_PLAYBACK_REVIEW);
  const [sseProgress, setSSEProgress] = useState<SSEProgressState>({
    currentStep: null,
    progress: 0,
    steps: createSSESteps(),
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

  const resetStreamingState = useCallback(() => {
    setReceivedReview(EMPTY_RECEIVED_REVIEW);
    setPlaybackReview(EMPTY_PLAYBACK_REVIEW);
    setSSEProgress({
      currentStep: null,
      progress: 0,
      steps: createSSESteps(),
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
    setErrorAction(null);
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
      llmModel?: StandardESReviewModel;
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
      const expectedCreditCost =
        esReviewBillingPlan === "free"
          ? calculateESReviewCost(params.sectionContent.length, "low-cost", { userPlan: "free" })
          : calculateESReviewCost(params.sectionContent.length, params.llmModel);

      setReview(null);
      setIsLoading(true);
      setError(null);
      setErrorAction(null);
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
        steps: createSSESteps(),
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

        const streamPath = `/api/documents/${documentId}/review/stream`;
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
          if (!isActiveRequest()) {
            return false;
          }

          if (response.status === 402) {
            setError("クレジットが不足しています。プランのアップグレードまたはクレジットの追加購入をご検討ください。");
            setErrorAction(null);
            trackEvent("ai_review_error", {
              status: 402,
              reviewMode: effectiveReviewMode,
              errorCode: "INSUFFICIENT_CREDITS",
            });
            return false;
          }

          const uiError = await parseApiErrorResponse(
            response,
            {
              code: "ES_REVIEW_REQUEST_FAILED",
              userMessage: "ES添削を開始できませんでした。",
              action: "入力内容や設定を確認して、もう一度お試しください。",
              retryable: true,
              authMessage: "ログイン状態を確認して、もう一度お試しください。",
              validationMessage: "入力内容や設定を確認して、もう一度お試しください。",
            },
            "useESReview.requestSectionReview"
          );
          setError(uiError.message);
          setErrorAction(uiError.action ?? null);
          trackEvent("ai_review_error", {
            status: response.status,
            reviewMode: effectiveReviewMode,
            errorCode: uiError.code,
          });
          return false;
        }

        const streamResult = await consumeESReviewStream({
          response,
          onEvent(event: SSEEvent) {
            if (!isActiveRequest()) {
              return;
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
                      rewriteText.length > prev.rewriteText.length ? rewriteText : prev.rewriteText,
                  }));
                } else if (
                  event.path === "improvement_explanation" &&
                  typeof event.value === "string"
                ) {
                  const explanationText = event.value;
                  setReceivedReview((prev) => ({
                    ...prev,
                    explanationText:
                      explanationText.length > prev.explanationText.length
                        ? explanationText
                        : prev.explanationText,
                    explanationComplete: true,
                  }));
                }
                break;

              case "array_item_complete":
                if (event.path.startsWith("keyword_sources.")) {
                  setReceivedReview((prev) => ({
                    ...prev,
                    keywordSources: upsertStreamItem(prev.keywordSources, event.path, event.value as TemplateSource),
                  }));
                }
                break;

              case "string_chunk":
                if (event.path === "streaming_rewrite") {
                  setReceivedReview((prev) => ({
                    ...prev,
                    rewriteText: prev.rewriteText + event.text,
                  }));
                } else if (event.path === "improvement_explanation") {
                  setReceivedReview((prev) => ({
                    ...prev,
                    explanationText: prev.explanationText + event.text,
                  }));
                }
                break;

              case "chunk":
              case "complete":
              case "error":
                break;
            }
          },
        });

        if (!isActiveRequest()) {
          return false;
        }

        if (!streamResult.ok) {
          if (streamResult.reason === "stream_error") {
            const streamUiError = toAppUiError(
              new Error(streamResult.message),
              {
                code: "ES_REVIEW_STREAM_FAILED",
                userMessage: "添削処理を完了できませんでした。",
                action: "時間を置いて、もう一度お試しください。",
                retryable: true,
              },
              "useESReview.sseError",
            );
            setError(streamUiError.message);
            setErrorAction(streamUiError.action ?? null);
            trackEvent("ai_review_error", { reviewMode: effectiveReviewMode });
            return false;
          }

          setError(streamResult.message);
          setErrorAction(null);
          return false;
        }

        setReview(streamResult.result);
        setCreditCost(streamResult.creditCost ?? expectedCreditCost);
        setReceivedReview((prev) => {
          const finalRewrite = streamResult.result.rewrites[0] ?? prev.rewriteText;
          const finalSources = streamResult.result.template_review?.keyword_sources ?? [];
          return {
            keywordSources: mergeStreamedItems(prev.keywordSources, finalSources),
            explanationText:
              streamResult.result.improvement_explanation ?? prev.explanationText,
            explanationComplete:
              prev.explanationComplete || Boolean(streamResult.result.improvement_explanation),
            rewriteText:
              finalRewrite.length > prev.rewriteText.length ? finalRewrite : prev.rewriteText,
          };
        });
        trackEvent("ai_review_complete", {
          templateType: params.templateType ?? null,
          creditCost: streamResult.creditCost ?? expectedCreditCost,
          reviewMode: effectiveReviewMode,
        });
        setSSEProgress((prev) => ({
          ...prev,
          progress: 100,
          isStreaming: false,
        }));
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          if (isActiveRequest()) {
            setError(null);
            setErrorAction(null);
            setIsCancelling(false);
          }
          return false;
        }

        if (isActiveRequest()) {
          const uiError = toAppUiError(
            err,
            {
              code: "ES_REVIEW_REQUEST_FAILED",
              userMessage: "ES添削を開始できませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "useESReview.requestSectionReview"
          );
          setError(uiError.message);
          setErrorAction(uiError.action ?? null);
          trackEvent("ai_review_error", {
            reviewMode: effectiveReviewMode,
            errorCode: uiError.code,
          });
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
    [clearTimer, documentId, esReviewBillingPlan],
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
    const targetText = receivedReview.explanationText;
    const visibleText = playbackReview.visibleExplanationText;

    if (!targetText || visibleText.length >= targetText.length) {
      return;
    }

    if (getReduceMotionPreference()) {
      startTransition(() => {
        setPlaybackReview((prev) => ({
          ...prev,
          visibleExplanationText: targetText,
        }));
      });
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextLength = Math.min(
            targetText.length,
            prev.visibleExplanationText.length + 2,
          );
          return {
            ...prev,
            visibleExplanationText: targetText.slice(0, nextLength),
          };
        });
      });
    }, 15);

    return () => window.clearTimeout(timer);
  }, [playbackReview.visibleExplanationText, receivedReview.explanationText]);

  useEffect(() => {
    const rewriteSettled =
      playbackReview.visibleRewriteText.length >= receivedReview.rewriteText.length;

    if (!rewriteSettled || playbackReview.visibleSources.length > 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        setPlaybackReview((prev) => {
          const nextSource = receivedReview.keywordSources[0];
          if (!nextSource) {
            return prev;
          }

          return {
            ...prev,
            visibleSources: [createVisibleSource(nextSource)],
          };
        });
      });
    }, getReduceMotionPreference() ? 0 : 140);

    return () => window.clearTimeout(timer);
  }, [
    playbackReview.visibleRewriteText.length,
    playbackReview.visibleSources.length,
    receivedReview.keywordSources,
    receivedReview.rewriteText.length,
  ]);

  useEffect(() => {
    const rewriteSettled =
      playbackReview.visibleRewriteText.length >= receivedReview.rewriteText.length;

    if (
      !rewriteSettled ||
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
    playbackReview.visibleRewriteText.length,
    playbackReview.visibleSources.length,
    receivedReview.keywordSources,
    receivedReview.rewriteText.length,
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
    playbackReview.visibleSources.length >= receivedReview.keywordSources.length &&
    playbackReview.visibleSources.every((source, index) => {
      const targetSource = receivedReview.keywordSources[index];
      return targetSource ? isVisibleSourceSettled(source, targetSource) : true;
    });

  return {
    review,
    visibleRewriteText: playbackReview.visibleRewriteText,
    explanationText: playbackReview.visibleExplanationText,
    explanationComplete: receivedReview.explanationComplete,
    visibleSources: playbackReview.visibleSources,
    finalRewriteText,
    playbackPhase,
    isPlaybackComplete,
    isLoading,
    error,
    errorAction,
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
