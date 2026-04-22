"use client";

import { useState, useMemo, useCallback } from "react";
import { DashboardHeader } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useDeadlinesDashboard,
  type DeadlineComputedStatus,
  type DeadlineDashboardData,
} from "@/hooks/useDeadlinesDashboard";
import { DEADLINE_TYPE_LABELS, type DeadlineType } from "@/hooks/useCompanyDeadlines";
import { DeadlineSummaryStats } from "./DeadlineSummaryStats";
import { DeadlineKanbanBoard } from "./DeadlineKanbanBoard";
import { DeadlineListView } from "./DeadlineListView";
import { DeadlinesDashboardSkeleton } from "@/components/skeletons/DeadlinesDashboardSkeleton";

type ViewMode = "kanban" | "list";

const SearchIcon = () => (
  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const KanbanIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
  </svg>
);

const ListIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const DEADLINE_TYPES: DeadlineType[] = [
  "es_submission",
  "web_test",
  "aptitude_test",
  "interview_1",
  "interview_2",
  "interview_3",
  "interview_final",
  "briefing",
  "internship",
  "offer_response",
  "other",
];

interface DeadlinesDashboardClientProps {
  initialData?: DeadlineDashboardData;
}

export function DeadlinesDashboardClient({
  initialData,
}: DeadlinesDashboardClientProps) {
  const [statusFilter, setStatusFilter] = useState<
    DeadlineComputedStatus | undefined
  >();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const filters = useMemo(
    () => ({
      status: statusFilter,
      type: typeFilter,
      search: searchQuery || undefined,
    }),
    [statusFilter, typeFilter, searchQuery],
  );

  const { deadlines, summary, isLoading, error } = useDeadlinesDashboard({
    filters,
    initialData,
  });

  const handleStatusClick = useCallback(
    (status: DeadlineComputedStatus | undefined) => {
      setStatusFilter(status);
    },
    [],
  );

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value === "all" ? undefined : value);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">締切管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全ての締切をステータス別に管理できます
          </p>
        </div>

        {/* Summary stats */}
        <div className="mb-6">
          <DeadlineSummaryStats
            summary={summary}
            activeStatus={statusFilter}
            onStatusClick={handleStatusClick}
          />
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative w-full sm:max-w-xs">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <SearchIcon />
              </div>
              <Input
                type="search"
                placeholder="締切を検索..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9"
                aria-label="締切を検索"
              />
            </div>

            {/* Type filter */}
            <Select
              value={typeFilter ?? "all"}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="w-36" aria-label="種類で絞り込み">
                <SelectValue placeholder="種類" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての種類</SelectItem>
                {DEADLINE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DEADLINE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {(statusFilter || typeFilter || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter(undefined);
                  setTypeFilter(undefined);
                  setSearchQuery("");
                }}
                className="text-muted-foreground"
              >
                フィルタをクリア
              </Button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="カンバンビュー"
              aria-pressed={viewMode === "kanban"}
            >
              <KanbanIcon />
              <span className="hidden sm:inline">ボード</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="リストビュー"
              aria-pressed={viewMode === "list"}
            >
              <ListIcon />
              <span className="hidden sm:inline">リスト</span>
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <DeadlinesDashboardSkeleton />
        ) : deadlines.length === 0 && !statusFilter && !typeFilter && !searchQuery ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <svg className="h-7 w-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mb-1.5 text-lg font-medium">締切はまだありません</h3>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              企業ページで締切を追加すると、ここに一覧表示されます
            </p>
          </div>
        ) : deadlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 py-16">
            <p className="text-sm text-muted-foreground">
              条件に一致する締切はありません
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          <DeadlineKanbanBoard deadlines={deadlines} />
        ) : (
          <DeadlineListView deadlines={deadlines} />
        )}
      </main>
    </div>
  );
}
