"use client";

import { useState, useMemo, useCallback } from "react";
import {
  CalendarDays,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
import { cn } from "@/lib/utils";
import {
  useDeadlinesDashboard,
  type DeadlineDashboardData,
  type DeadlineComputedStatus,
} from "@/hooks/useDeadlinesDashboard";
import {
  DEADLINE_TYPE_LABELS,
  type DeadlineType,
} from "@/hooks/useCompanyDeadlines";
import { DeadlineKanbanBoard } from "./DeadlineKanbanBoard";
import { DeadlineListView } from "./DeadlineListView";
import { DeadlinesDashboardSkeleton } from "@/components/skeletons/DeadlinesDashboardSkeleton";

type ViewMode = "kanban" | "list";
type SortMode = "dueDate" | "company" | "type";

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

const deadlineSortOptions = [
  { value: "dueDate", label: "期限が近い順" },
  { value: "company", label: "企業名順" },
  { value: "type", label: "種類順" },
];

const deadlineFilterTabs = [
  { key: "all", label: "すべて" },
  { key: "not_started", label: "未着手" },
  { key: "in_progress", label: "進行中" },
  { key: "completed", label: "完了" },
  { key: "overdue", label: "期限切れ" },
];

const deadlineViewOptions = [
  { key: "kanban", icon: <LayoutGrid className="h-4 w-4" />, label: "ボード表示" },
  { key: "list", icon: <List className="h-4 w-4" />, label: "リスト表示" },
];

const controlClassName =
  "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-[0_10px_26px_-22px_rgba(15,23,42,0.55)]";

interface DeadlinesDashboardClientProps {
  initialData?: DeadlineDashboardData;
}

export function DeadlinesDashboardClient({
  initialData,
}: DeadlinesDashboardClientProps) {
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [sortMode, setSortMode] = useState<SortMode>("dueDate");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filters = useMemo(
    () => ({
      type: typeFilter,
      search: searchQuery || undefined,
      sort: sortMode,
      sortDir: "asc" as const,
    }),
    [typeFilter, searchQuery, sortMode],
  );

  const { deadlines, isLoading, error } = useDeadlinesDashboard({
    filters,
    initialData,
  });

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value === "all" ? undefined : value);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortMode(value as SortMode);
  }, []);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: deadlines.length };
    for (const d of deadlines) {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
    }
    return counts;
  }, [deadlines]);

  const filteredDeadlines = useMemo(
    () =>
      statusFilter === "all"
        ? deadlines
        : deadlines.filter((d) => d.status === statusFilter),
    [deadlines, statusFilter],
  );
  const visibleBoardStatuses = useMemo<DeadlineComputedStatus[] | undefined>(
    () =>
      statusFilter === "all"
        ? undefined
        : ([statusFilter as DeadlineComputedStatus]),
    [statusFilter],
  );

  const hasFilters = Boolean(typeFilter || searchQuery || statusFilter !== "all");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_48%,#ffffff_100%)]">
      <main className="mx-auto max-w-[92rem] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-8 sm:px-8 sm:py-10 lg:px-10 xl:px-12">
        <ProductPageHeader
          title="締切管理"
          description="未着手、進行中、期限切れを同じ画面で確認し、今日動くべき締切を絞り込めます"
          backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
          badge={
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {deadlines.length}件
            </span>
          }
        />

        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.5)] backdrop-blur-xl sm:mb-8 sm:p-4">
          <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(18rem,1.4fr)_minmax(11rem,0.7fr)_minmax(11rem,0.7fr)_auto]">
            <div className="relative col-span-2 min-w-0 xl:col-span-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                aria-label="締切を検索..."
                placeholder="締切を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm shadow-[0_10px_26px_-22px_rgba(15,23,42,0.55)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>

            <Select value={sortMode} onValueChange={handleSortChange}>
              <SelectTrigger className={cn(controlClassName, "min-w-0")} aria-label="並び順">
                <SelectValue placeholder="並び順" />
              </SelectTrigger>
              <SelectContent>
                {deadlineSortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={typeFilter ?? "all"}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className={cn(controlClassName, "min-w-0")} aria-label="種類で絞り込み">
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

            <div className="col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 xl:col-span-1 xl:overflow-visible xl:pb-0">
              <ViewToggle
                options={deadlineViewOptions}
                activeKey={viewMode}
                onChange={(key) => setViewMode(key as ViewMode)}
              />
              {hasFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter(undefined);
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                  className="h-10 shrink-0 rounded-xl text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  クリア
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80">
            {deadlineFilterTabs.map((tab) => {
              const tabCount = tabCounts[tab.key] ?? 0;
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-all duration-200 sm:h-10 sm:gap-2 sm:px-4 sm:text-sm",
                    isActive
                      ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white shadow-[0_18px_36px_-26px_rgba(15,23,42,0.7)]"
                      : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      isActive ? "bg-white/16 text-white" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {tabCount}
                  </span>
                </button>
              );
            })}
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
        ) : deadlines.length === 0 &&
          !typeFilter &&
          !searchQuery &&
          statusFilter === "all" ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <CalendarDays className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-1.5 text-lg font-medium">締切はまだありません</h3>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              企業ページで締切を追加すると、ここに一覧表示されます
            </p>
          </div>
        ) : filteredDeadlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 py-16">
            <p className="text-sm text-muted-foreground">
              条件に一致する締切はありません
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          <DeadlineKanbanBoard
            deadlines={filteredDeadlines}
            visibleStatuses={visibleBoardStatuses}
          />
        ) : (
          <DeadlineListView deadlines={filteredDeadlines} />
        )}
      </main>
    </div>
  );
}
