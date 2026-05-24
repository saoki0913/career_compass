"use client";

import { useState, useMemo, useCallback } from "react";
import {
  CalendarDays,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListPageFilterBar } from "@/components/shared/ListPageFilterBar";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
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

interface DeadlinesDashboardClientProps {
  initialData?: DeadlineDashboardData;
}

export function DeadlinesDashboardClient({
  initialData,
}: DeadlinesDashboardClientProps) {
  const [typeFilter, setTypeFilter] = useState<DeadlineType | undefined>();
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
    setTypeFilter(value === "all" ? undefined : (value as DeadlineType));
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
          description="選考の締切をまとめて管理できます"
          backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
          badge={
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {deadlines.length}件
            </span>
          }
        />

        <ListPageFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="締切を検索..."
          filterTabs={deadlineFilterTabs}
          activeFilter={statusFilter}
          onFilterChange={(key) => setStatusFilter(key)}
          tabCounts={tabCounts}
          sortOptions={deadlineSortOptions}
          sortBy={sortMode}
          onSortChange={(value) => handleSortChange(value as SortMode)}
          extraFilter={
            <Select value={typeFilter ?? "all"} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-12 w-full rounded-xl lg:h-9 lg:w-[160px]" aria-label="種類で絞り込み">
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
          }
          extraFilterLayout="pair"
          viewToggle={
            <ViewToggle
              options={deadlineViewOptions}
              activeKey={viewMode}
              onChange={(key) => setViewMode(key as ViewMode)}
            />
          }
          clearAction={
            hasFilters
              ? {
                  label: "クリア",
                  onClear: () => {
                    setTypeFilter(undefined);
                    setSearchQuery("");
                    setStatusFilter("all");
                  },
                }
              : undefined
          }
          activeFilters={[
            statusFilter !== "all"
              ? `状態: ${deadlineFilterTabs.find((tab) => tab.key === statusFilter)?.label ?? statusFilter}`
              : "",
            typeFilter ? `種類: ${DEADLINE_TYPE_LABELS[typeFilter]}` : "",
            searchQuery.trim() ? `検索: ${searchQuery.trim()}` : "",
          ].filter(Boolean)}
        />

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
