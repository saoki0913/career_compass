"use client";

import { useState, useCallback } from "react";

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

export interface ReviewResult {
  scores: ReviewScores;
  top3: ReviewIssue[];
  rewrites: string[];
  section_feedbacks?: SectionFeedback[];
}

export interface UseESReviewOptions {
  documentId: string;
}

export interface UseESReviewReturn {
  review: ReviewResult | null;
  isLoading: boolean;
  error: string | null;
  creditCost: number | null;
  requestReview: (params: {
    content: string;
    style?: string;
    sectionId?: string;
    hasCompanyRag?: boolean;
    sections?: string[];
    sectionData?: SectionData[];  // Section data with character limits
  }) => Promise<boolean>;
  clearReview: () => void;
}

const FREE_STYLES = ["バランス", "堅め", "個性強め"];
const PAID_STYLES = [...FREE_STYLES, "短く", "熱意強め", "結論先出し", "具体例強め", "端的"];

export function getAvailableStyles(isPaid: boolean): string[] {
  return isPaid ? PAID_STYLES : FREE_STYLES;
}

export function useESReview({ documentId }: UseESReviewOptions): UseESReviewReturn {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState<number | null>(null);

  const requestReview = useCallback(
    async (params: {
      content: string;
      style?: string;
      sectionId?: string;
      hasCompanyRag?: boolean;
      sections?: string[];
      sectionData?: SectionData[];
    }): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      setCreditCost(null);

      try {
        const response = await fetch(`/api/documents/${documentId}/review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: params.content,
            style: params.style || "バランス",
            sectionId: params.sectionId,
            hasCompanyRag: params.hasCompanyRag || false,
            sections: params.sections,
            sectionData: params.sectionData,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 402) {
            setError(`クレジットが不足しています（必要: ${data.creditCost}クレジット）`);
          } else if (response.status === 401) {
            setError(data.error || "ログインが必要です");
          } else {
            setError(data.error || "添削リクエストに失敗しました");
          }
          return false;
        }

        setReview(data.review);
        setCreditCost(data.creditCost);
        return true;
      } catch (err) {
        console.error("Review request error:", err);
        setError("ネットワークエラーが発生しました");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [documentId]
  );

  const clearReview = useCallback(() => {
    setReview(null);
    setError(null);
    setCreditCost(null);
  }, []);

  return {
    review,
    isLoading,
    error,
    creditCost,
    requestReview,
    clearReview,
  };
}
