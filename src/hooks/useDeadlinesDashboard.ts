/**
 * useDeadlinesDashboard hook
 *
 * SWR hook for the deadline dashboard page.
 * Fetches from /api/deadlines with query params for filters.
 */

import useSWR from "swr";
import { buildAuthFetchHeaders } from "@/lib/swr-fetcher";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifySwrUserFacingFailure } from "@/lib/client-error-ui";
import { useAuth } from "@/components/auth/AuthProvider";

export type DeadlineComputedStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "overdue";

export interface DeadlineDashboardItem {
  id: string;
  companyId: string;
  companyName: string;
  type: string;
  title: string;
  dueDate: string;
  status: DeadlineComputedStatus;
  statusOverride: string | null;
  isConfirmed: boolean;
  completedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  createdAt: string;
}

export interface DeadlineDashboardSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

export interface DeadlineDashboardData {
  deadlines: DeadlineDashboardItem[];
  summary: DeadlineDashboardSummary;
}

export interface DeadlineDashboardFilters {
  status?: DeadlineComputedStatus;
  type?: string;
  companyId?: string;
  search?: string;
  sort?: "dueDate" | "company" | "type";
  sortDir?: "asc" | "desc";
}

const FETCH_FALLBACK = {
  code: "DEADLINES_DASHBOARD_FETCH_FAILED",
  userMessage: "締切一覧を読み込めませんでした。",
  action: "ページを再読み込みしてください。",
  retryable: true,
} as const;

function buildDeadlinesUrl(filters: DeadlineDashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.companyId) params.set("companyId", filters.companyId);
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  const qs = params.toString();
  return qs ? `/api/deadlines?${qs}` : "/api/deadlines";
}

async function fetchDashboardData(url: string): Promise<DeadlineDashboardData> {
  const response = await fetch(url, {
    headers: buildAuthFetchHeaders(),
    credentials: "include",
  });

  if (response.ok) {
    return response.json() as Promise<DeadlineDashboardData>;
  }

  if (response.status === 401) {
    return {
      deadlines: [],
      summary: {
        total: 0,
        notStarted: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
        completionRate: 0,
      },
    };
  }

  throw await parseApiErrorResponse(
    response,
    FETCH_FALLBACK,
    "useDeadlinesDashboard.fetch",
  );
}

export interface UseDeadlinesDashboardOptions {
  filters?: DeadlineDashboardFilters;
  initialData?: DeadlineDashboardData;
}

export function useDeadlinesDashboard(
  options: UseDeadlinesDashboardOptions = {},
) {
  const { isLoading: isAuthLoading, isReady: isAuthReady } = useAuth();
  const { filters = {}, initialData } = options;

  const url = isAuthReady ? buildDeadlinesUrl(filters) : null;

  const { data, error, isLoading: swrLoading, mutate } = useSWR(
    url,
    fetchDashboardData,
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      dedupingInterval: 3000,
      revalidateOnMount: !initialData,
      onError(err, key) {
        const ui = toAppUiError(err, FETCH_FALLBACK, "useDeadlinesDashboard.swr");
        notifySwrUserFacingFailure(ui, JSON.stringify(key));
      },
    },
  );

  const isLoading = !isAuthReady ? true : swrLoading;

  return {
    data: data ?? null,
    deadlines: data?.deadlines ?? [],
    summary: data?.summary ?? {
      total: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      completionRate: 0,
    },
    isLoading: isAuthLoading || isLoading,
    error: error instanceof Error ? error.message : error != null ? String(error) : null,
    mutate,
  };
}

/**
 * Update a deadline's status override via PUT /api/deadlines/[id]/status.
 * Returns true on success.
 */
export async function updateDeadlineStatus(
  deadlineId: string,
  status: DeadlineComputedStatus | null,
): Promise<boolean> {
  const response = await fetch(`/api/deadlines/${deadlineId}/status`, {
    method: "PUT",
    headers: buildAuthFetchHeaders(),
    credentials: "include",
    body: JSON.stringify({ status }),
  });

  if (response.ok) return true;

  throw await parseApiErrorResponse(
    response,
    {
      code: "DEADLINE_STATUS_UPDATE_FAILED",
      userMessage: "ステータスの更新に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
    },
    "updateDeadlineStatus",
  );
}
