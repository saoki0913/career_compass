"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export interface SubmissionItem {
  id: string;
  userId: string | null;
  guestId: string | null;
  applicationId: string;
  type: "resume" | "es" | "photo" | "transcript" | "certificate" | "portfolio" | "other";
  name: string;
  isRequired: boolean;
  status: "not_started" | "in_progress" | "completed";
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SUBMISSION_TYPES = {
  resume: "履歴書",
  es: "ES",
  photo: "証明写真",
  transcript: "成績証明書",
  certificate: "資格証明書",
  portfolio: "ポートフォリオ",
  other: "その他",
};

export const SUBMISSION_STATUS = {
  not_started: "未着手",
  in_progress: "作成中",
  completed: "完了",
};

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

export function useSubmissions(applicationId: string | null) {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!applicationId) {
      setSubmissions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/applications/${applicationId}/submissions`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "SUBMISSIONS_FETCH_FAILED",
            userMessage: "提出物を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useSubmissions.fetchSubmissions"
        );
      }

      const data = await response.json();
      setSubmissions(data.submissions || []);
      setError(null);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "SUBMISSIONS_FETCH_FAILED",
          userMessage: "提出物を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useSubmissions.fetchSubmissions"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const createSubmission = async (data: {
    type: SubmissionItem["type"];
    name: string;
    isRequired?: boolean;
    notes?: string;
  }) => {
    if (!applicationId) throw new Error("Application ID required");

    const response = await fetch(`/api/applications/${applicationId}/submissions`, {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "SUBMISSION_CREATE_FAILED",
          userMessage: "提出物を作成できませんでした。",
          action: "入力内容を確認して、もう一度お試しください。",
          retryable: true,
        },
        "useSubmissions.createSubmission"
      );
    }

    const result = await response.json();
    await fetchSubmissions();
    return result.submission;
  };

  const updateSubmission = async (id: string, data: Partial<SubmissionItem>) => {
    const response = await fetch(`/api/submissions/${id}`, {
      method: "PUT",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "SUBMISSION_UPDATE_FAILED",
          userMessage: "提出物を更新できませんでした。",
          action: "入力内容を確認して、もう一度お試しください。",
          retryable: true,
        },
        "useSubmissions.updateSubmission"
      );
    }

    const result = await response.json();
    await fetchSubmissions();
    return result.submission;
  };

  const deleteSubmission = async (id: string) => {
    const response = await fetch(`/api/submissions/${id}`, {
      method: "DELETE",
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "SUBMISSION_DELETE_FAILED",
          userMessage: "提出物を削除できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "useSubmissions.deleteSubmission"
      );
    }

    await fetchSubmissions();
  };

  return {
    submissions,
    isLoading,
    error,
    refresh: fetchSubmissions,
    createSubmission,
    updateSubmission,
    deleteSubmission,
  };
}
