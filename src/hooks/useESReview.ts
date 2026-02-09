"use client";

import { useState, useCallback, useRef } from "react";
import type { ProcessingStep } from "@/components/ui/EnhancedProcessingSteps";
import { trackEvent } from "@/lib/analytics/client";

export interface ReviewScores {
  logic: number;
  specificity: number;
  passion: number;
  company_connection?: number;
  readability: number;
}

export interface ReviewIssue {
  category: string;
  issue: string;
  suggestion: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface SectionFeedback {
  section_title: string;
  feedback: string;
  rewrite?: string;  // Section-specific rewrite
}

// Section data with character limit for review
export interface SectionData {
  title: string;
  content: string;
  charLimit?: number;
}

// Template types for template-based ES review
export type TemplateType =
  | "basic"
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  basic: "汎用ES添削",
  company_motivation: "志望理由",
  intern_reason: "インターン理由",
  intern_goals: "インターンでやりたいこと・学びたいこと",
  gakuchika: "ガクチカ",
  post_join_goals: "入社してからやりたいこと",
  role_course_reason: "職種・コースを選択した理由",
  work_values: "働くうえで大切にしている価値観",
};

export const TEMPLATE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "company_motivation", label: "志望理由" },
  { value: "intern_reason", label: "インターン理由" },
  { value: "intern_goals", label: "インターンでやりたいこと・学びたいこと" },
  { value: "gakuchika", label: "ガクチカ" },
  { value: "post_join_goals", label: "入社してからやりたいこと" },
  { value: "role_course_reason", label: "職種・コースを選択した理由" },
  { value: "work_values", label: "働くうえで大切にしている価値観" },
];

// テンプレートごとに必要な追加フィールド
export const TEMPLATE_EXTRA_FIELDS: Record<TemplateType, string[]> = {
  basic: [],
  company_motivation: [],
  intern_reason: ["intern_name"],
  intern_goals: ["intern_name"],
  gakuchika: [],
  post_join_goals: [],
  role_course_reason: ["role_name"],
  work_values: [],
};

// 追加フィールドのラベル
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
  excerpt?: string;
}

export interface TemplateReview {
  template_type: TemplateType;
  variants: TemplateVariant[];
  keyword_sources: TemplateSource[];
  strengthen_points?: string[];
}

export interface ReviewResult {
  scores: ReviewScores;
  top3: ReviewIssue[];
  rewrites: string[];
  section_feedbacks?: SectionFeedback[];
  template_review?: TemplateReview;
}

export interface UseESReviewOptions {
  documentId: string;
}

// Review mode: full ES or single section
export type ReviewMode = "full" | "section";

// Current section info for section review mode
export interface CurrentSectionInfo {
  title: string;
  charLimit?: number;
}

// SSE streaming progress state
export interface SSEProgressState {
  currentStep: string | null;
  progress: number;
  steps: ProcessingStep[];
  isStreaming: boolean;
}

// SSE event types from backend
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
  creditCost: number;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
  error_type?: string;
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

export interface UseESReviewReturn {
  review: ReviewResult | null;
  isLoading: boolean;
  error: string | null;
  creditCost: number | null;
  reviewMode: ReviewMode;
  currentSection: CurrentSectionInfo | null;
  // Cancel support
  cancelReview: () => void;
  isCancelling: boolean;
  elapsedTime: number;  // Elapsed time in seconds
  // SSE streaming progress
  sseProgress: SSEProgressState;
  requestReview: (params: {
    content: string;
    style?: string;
    sectionId?: string;
    hasCompanyRag?: boolean;
    companyId?: string;
    sections?: string[];
    sectionData?: SectionData[];  // Section data with character limits
    // Section review mode parameters
    reviewMode?: ReviewMode;
    sectionTitle?: string;
    sectionCharLimit?: number;
    // Template-based review
    templateType?: TemplateType;
  }) => Promise<boolean>;
  requestSectionReview: (params: {
    sectionTitle: string;
    sectionContent: string;
    sectionCharLimit?: number;
    style?: string;
    hasCompanyRag?: boolean;
    companyId?: string;
    // Template-based review
    templateType?: TemplateType;
    internName?: string;
    roleName?: string;
  }) => Promise<boolean>;
  clearReview: () => void;
}

const FREE_STYLES = ["バランス", "堅め", "個性強め"];
const PAID_STYLES = [...FREE_STYLES, "短く", "熱意強め", "結論先出し", "具体例強め", "端的"];

export function getAvailableStyles(isPaid: boolean): string[] {
  return isPaid ? PAID_STYLES : FREE_STYLES;
}

// Default SSE steps from backend (durations are estimates for progress animation)
const DEFAULT_SSE_STEPS: ProcessingStep[] = [
  { id: "validation", label: "入力を検証中...", subLabel: "内容の確認", duration: 1000 },
  { id: "rag_fetch", label: "企業情報を取得中...", subLabel: "RAGコンテキスト検索", duration: 8000 },
  { id: "llm_review", label: "AIが添削中...", subLabel: "スコアと改善点を分析", duration: 12000 },
  { id: "rewrite", label: "リライトを生成中...", subLabel: "完了処理", duration: 1000 },
];

export function useESReview({ documentId }: UseESReviewOptions): UseESReviewReturn {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("full");
  const [currentSection, setCurrentSection] = useState<CurrentSectionInfo | null>(null);

  // Cancel support
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // SSE streaming progress
  const [sseProgress, setSSEProgress] = useState<SSEProgressState>({
    currentStep: null,
    progress: 0,
    steps: DEFAULT_SSE_STEPS,
    isStreaming: false,
  });

  // Cancel the current review request
  const cancelReview = useCallback(() => {
    if (abortControllerRef.current && isLoading) {
      setIsCancelling(true);
      abortControllerRef.current.abort();
    }
  }, [isLoading]);

  // Cleanup timer on unmount or when loading stops
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Parse SSE event from text
  const parseSSEEvent = useCallback((text: string): SSEEvent | null => {
    try {
      // SSE format: "data: {...}\n\n"
      const dataMatch = text.match(/^data:\s*(.+)$/m);
      if (dataMatch) {
        return JSON.parse(dataMatch[1]) as SSEEvent;
      }
      return null;
    } catch {
      console.warn("Failed to parse SSE event:", text);
      return null;
    }
  }, []);

  const requestReview = useCallback(
    async (params: {
      content: string;
      style?: string;
      sectionId?: string;
      hasCompanyRag?: boolean;
      companyId?: string;
      sections?: string[];
      sectionData?: SectionData[];
      reviewMode?: ReviewMode;
      sectionTitle?: string;
      sectionCharLimit?: number;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
    }): Promise<boolean> => {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);
      setCreditCost(null);
      setIsCancelling(false);
      setElapsedTime(0);

      // Reset SSE progress
      setSSEProgress({
        currentStep: null,
        progress: 0,
        steps: DEFAULT_SSE_STEPS,
        isStreaming: true,
      });

      // Start elapsed time counter
      clearTimer();
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Update review mode state
      const mode = params.reviewMode || "full";
      setReviewMode(mode);
      if (mode === "section" && params.sectionTitle) {
        setCurrentSection({
          title: params.sectionTitle,
          charLimit: params.sectionCharLimit,
        });
      } else {
        setCurrentSection(null);
      }

      try {
        trackEvent("ai_review_start", {
          mode,
          templateType: params.templateType ?? null,
          hasCompanyRag: params.hasCompanyRag ?? false,
        });

        // Use SSE streaming endpoint
        const response = await fetch(`/api/documents/${documentId}/review/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            content: params.content,
            style: params.style || "バランス",
            sectionId: params.sectionId,
            hasCompanyRag: params.hasCompanyRag || false,
            companyId: params.companyId,
            sections: params.sections,
            sectionData: params.sectionData,
            // Section review mode parameters
            reviewMode: mode,
            sectionTitle: params.sectionTitle,
            sectionCharLimit: params.sectionCharLimit,
            // Template-based review
            templateType: params.templateType,
            internName: params.internName,
            roleName: params.roleName,
          }),
        });

        // Check for non-SSE error responses
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (response.status === 402) {
            setError(`クレジットが不足しています（必要: ${data.creditCost}クレジット）`);
          } else if (response.status === 401) {
            setError(data.error || "ログインが必要です");
          } else {
            setError(data.error || "添削リクエストに失敗しました");
          }
          trackEvent("ai_review_error", { status: response.status });
          return false;
        }

        // Process SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          setError("ストリーミングがサポートされていません");
          return false;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete events in buffer
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // Keep incomplete event in buffer

          for (const eventText of events) {
            if (!eventText.trim()) continue;

            const event = parseSSEEvent(eventText);
            if (!event) continue;

            switch (event.type) {
              case "progress":
                setSSEProgress((prev) => ({
                  ...prev,
                  currentStep: event.step,
                  progress: event.progress,
                  // Update step labels if provided
                  steps: event.label
                    ? prev.steps.map((s) =>
                        s.id === event.step
                          ? { ...s, label: event.label!, subLabel: event.subLabel }
                          : s
                      )
                    : prev.steps,
                }));
                break;

              case "complete":
                setReview(event.result);
                setCreditCost(event.creditCost);
                trackEvent("ai_review_complete", {
                  mode,
                  templateType: params.templateType ?? null,
                  creditCost: event.creditCost,
                });
                try {
                  localStorage.setItem("cc_activation_ai_review_done", "1");
                } catch {
                  // ignore
                }
                setSSEProgress((prev) => ({
                  ...prev,
                  progress: 100,
                  isStreaming: false,
                }));
                return true;

              case "error":
                setError(event.message || "添削処理でエラーが発生しました");
                trackEvent("ai_review_error");
                return false;
            }
          }
        }

        // If we got here without a complete event, something went wrong
        if (!review) {
          setError("添削結果を受信できませんでした");
          return false;
        }

        return true;
      } catch (err) {
        // Handle abort error (user cancelled)
        if (err instanceof Error && err.name === "AbortError") {
          setError(null);  // Don't show error for user-initiated cancel
          setIsCancelling(false);
          return false;
        }
        console.error("Review request error:", err);
        setError("ネットワークエラーが発生しました");
        trackEvent("ai_review_error");
        return false;
      } finally {
        clearTimer();
        setIsLoading(false);
        setIsCancelling(false);
        setSSEProgress((prev) => ({ ...prev, isStreaming: false }));
        abortControllerRef.current = null;
      }
    },
    [documentId, clearTimer, parseSSEEvent, review]
  );

  // Convenience function for section review
  const requestSectionReview = useCallback(
    async (params: {
      sectionTitle: string;
      sectionContent: string;
      sectionCharLimit?: number;
      style?: string;
      hasCompanyRag?: boolean;
      companyId?: string;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
    }): Promise<boolean> => {
      return requestReview({
        content: params.sectionContent,
        style: params.style,
        hasCompanyRag: params.hasCompanyRag,
        companyId: params.companyId,
        reviewMode: "section",
        sectionTitle: params.sectionTitle,
        sectionCharLimit: params.sectionCharLimit,
        templateType: params.templateType,
        internName: params.internName,
        roleName: params.roleName,
      });
    },
    [requestReview]
  );

  const clearReview = useCallback(() => {
    setReview(null);
    setError(null);
    setCreditCost(null);
    setReviewMode("full");
    setCurrentSection(null);
    setSSEProgress({
      currentStep: null,
      progress: 0,
      steps: DEFAULT_SSE_STEPS,
      isStreaming: false,
    });
  }, []);

  return {
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
  };
}
