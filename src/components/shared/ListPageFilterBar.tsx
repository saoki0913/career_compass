"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FILTER_BAR_SCROLL_ROW_CLASS =
  "flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80";

export interface FilterTab {
  key: string;
  label: string;
}

export interface SortOption {
  value: string;
  label: string;
}

interface ListPageFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder: string;
  filterTabs?: FilterTab[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  tabCounts?: Record<string, number>;
  sortOptions: SortOption[];
  sortBy: string;
  onSortChange: (value: string) => void;
  extraFilter?: React.ReactNode;
  viewToggle?: React.ReactNode;
  actions?: React.ReactNode;
  activeFilters?: string[];
  clearAction?: {
    label?: string;
    onClear: () => void;
  };
}

export function ListPageFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  filterTabs = [],
  activeFilter,
  onFilterChange,
  tabCounts = {},
  sortOptions,
  sortBy,
  onSortChange,
  extraFilter,
  viewToggle,
  actions,
  activeFilters = [],
  clearAction,
}: ListPageFilterBarProps) {
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? "並び順";
  const hasStatusRow = filterTabs.length > 0 || activeFilters.length > 0;

  return (
    <div className="mb-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-xl sm:mb-8">
      <div className="min-w-0 space-y-2">
        <div className={FILTER_BAR_SCROLL_ROW_CLASS}>
          <div className="relative min-w-[14rem] max-w-[22rem] flex-[1_0_16rem]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/80 bg-background pl-10 pr-4 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="h-10 w-[160px] shrink-0">
              <span className="min-w-0 flex-1 truncate text-left">{selectedSortLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {extraFilter ? (
            <div className="flex shrink-0 items-center gap-2 [&>*]:min-w-0 [&>*]:shrink-0">
              {extraFilter}
            </div>
          ) : null}

          {viewToggle ? <div className="shrink-0">{viewToggle}</div> : null}

          {clearAction ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAction.onClear}
              className="h-10 shrink-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              {clearAction.label ?? "クリア"}
            </Button>
          ) : null}

          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>

        {hasStatusRow ? (
          <div className={FILTER_BAR_SCROLL_ROW_CLASS}>
            {filterTabs.map((tab) => {
              const tabCount = tabCounts[tab.key] ?? 0;
              const isActive = activeFilter === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onFilterChange?.(tab.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white shadow-[0_18px_36px_-26px_rgba(15,23,42,0.64)]"
                      : "border border-slate-200/80 bg-white/92 text-slate-500 hover:border-slate-300 hover:text-slate-900"
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200",
                      isActive ? "bg-white/16 text-white" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {tabCount}
                  </span>
                </button>
              );
            })}
            {filterTabs.length > 0 && activeFilters.length > 0 ? (
              <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            ) : null}
            {activeFilters.map((label) => (
              <span
                key={label}
                className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
