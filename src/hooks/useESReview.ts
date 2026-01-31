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
  | "company_motivation"
  | "intern_reason"
  | "intern_goals"
  | "gakuchika"
  | "post_join_goals"
  | "role_course_reason"
  | "work_values";

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
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

export interface UseESReviewReturn {
  review: ReviewResult | null;
  isLoading: boolean;
  error: string | null;
  creditCost: number | null;
  reviewMode: ReviewMode;
  currentSection: CurrentSectionInfo | null;
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

export function useESReview({ documentId }: UseESReviewOptions): UseESReviewReturn {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("full");
  const [currentSection, setCurrentSection] = useState<CurrentSectionInfo | null>(null);

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
      setIsLoading(true);
      setError(null);
      setCreditCost(null);

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
  }, []);

  return {
    review,
    isLoading,
    error,
    creditCost,
    reviewMode,
    currentSection,
    requestReview,
    requestSectionReview,
    clearReview,
  };
}
