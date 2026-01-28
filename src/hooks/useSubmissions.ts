"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

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
        throw new Error("Failed to fetch submissions");
      }

      const data = await response.json();
      setSubmissions(data.submissions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提出物の取得に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "提出物の作成に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "提出物の更新に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "提出物の削除に失敗しました");
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
