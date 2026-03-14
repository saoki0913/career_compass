/**
 * Applications Hook
 *
 * Manages applications (応募枠) for a company
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export type ApplicationType =
  | "summer_intern"
  | "fall_intern"
  | "winter_intern"
  | "early"
  | "main"
  | "other";

export type ApplicationStatus = "active" | "completed" | "withdrawn";

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  summer_intern: "夏インターン",
  fall_intern: "秋インターン",
  winter_intern: "冬インターン",
  early: "早期選考",
  main: "本選考",
  other: "その他",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  active: "選考中",
  completed: "完了",
  withdrawn: "辞退",
};

export interface Application {
  id: string;
  companyId: string;
  name: string;
  type: ApplicationType;
  status: ApplicationStatus;
  phase: string[];
  sortOrder: number;
  deadlineCount: number;
  nearestDeadline: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobType {
  id: string;
  applicationId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface CreateApplicationInput {
  name: string;
  type: ApplicationType;
}

export interface UpdateApplicationInput {
  name?: string;
  type?: ApplicationType;
  status?: ApplicationStatus;
  phase?: string[];
}

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

export function useApplications(companyId: string) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    if (!companyId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/companies/${companyId}/applications`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "APPLICATIONS_FETCH_FAILED",
            userMessage: "応募枠を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useApplications.fetchApplications"
        );
      }

      const data = await response.json();
      setApplications(data.applications || []);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "APPLICATIONS_FETCH_FAILED",
          userMessage: "応募枠を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useApplications.fetchApplications"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const createApplication = useCallback(
    async (input: CreateApplicationInput): Promise<Application | null> => {
      try {
        const response = await fetch(`/api/companies/${companyId}/applications`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "APPLICATION_CREATE_FAILED",
              userMessage: "応募枠を作成できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: true,
            },
            "useApplications.createApplication"
          );
        }

        const data = await response.json();
        await fetchApplications();
        return data.application;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "APPLICATION_CREATE_FAILED",
            userMessage: "応募枠を作成できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useApplications.createApplication"
        );
        setError(uiError.message);
        return null;
      }
    },
    [companyId, fetchApplications]
  );

  const updateApplication = useCallback(
    async (applicationId: string, input: UpdateApplicationInput): Promise<boolean> => {
      try {
        const response = await fetch(`/api/applications/${applicationId}`, {
          method: "PUT",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "APPLICATION_UPDATE_FAILED",
              userMessage: "応募枠を更新できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: true,
            },
            "useApplications.updateApplication"
          );
        }

        await fetchApplications();
        return true;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "APPLICATION_UPDATE_FAILED",
            userMessage: "応募枠を更新できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useApplications.updateApplication"
        );
        setError(uiError.message);
        return false;
      }
    },
    [fetchApplications]
  );

  const deleteApplication = useCallback(
    async (applicationId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/applications/${applicationId}`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "APPLICATION_DELETE_FAILED",
              userMessage: "応募枠を削除できませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "useApplications.deleteApplication"
          );
        }

        await fetchApplications();
        return true;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "APPLICATION_DELETE_FAILED",
            userMessage: "応募枠を削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "useApplications.deleteApplication"
        );
        setError(uiError.message);
        return false;
      }
    },
    [fetchApplications]
  );

  return {
    applications,
    isLoading,
    error,
    refresh: fetchApplications,
    createApplication,
    updateApplication,
    deleteApplication,
  };
}

export function useApplicationDetail(applicationId: string) {
  const [application, setApplication] = useState<Application | null>(null);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplication = useCallback(async () => {
    if (!applicationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "APPLICATION_DETAIL_FETCH_FAILED",
            userMessage: "応募枠の詳細を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useApplicationDetail.fetchApplication"
        );
      }

      const data = await response.json();
      setApplication(data.application);
      setJobTypes(data.jobTypes || []);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "APPLICATION_DETAIL_FETCH_FAILED",
          userMessage: "応募枠の詳細を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useApplicationDetail.fetchApplication"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const addJobType = useCallback(
    async (name: string): Promise<JobType | null> => {
      try {
        const response = await fetch(`/api/applications/${applicationId}/job-types`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({ name }),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "JOB_TYPE_CREATE_FAILED",
              userMessage: "職種を追加できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: true,
            },
            "useApplicationDetail.addJobType"
          );
        }

        const data = await response.json();
        await fetchApplication();
        return data.jobType;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "JOB_TYPE_CREATE_FAILED",
            userMessage: "職種を追加できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useApplicationDetail.addJobType"
        );
        setError(uiError.message);
        return null;
      }
    },
    [applicationId, fetchApplication]
  );

  return {
    application,
    jobTypes,
    isLoading,
    error,
    refresh: fetchApplication,
    addJobType,
  };
}
