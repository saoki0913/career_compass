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

  return (
    <div className="mb-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-xl sm:mb-8 sm:p-4">
      <div className="min-w-0 space-y-3">
        <div className="relative w-full min-w-0 sm:max-w-[22rem]">
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

        <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden sm:flex-nowrap sm:overflow-x-auto sm:overscroll-x-contain sm:pb-1 sm:[-ms-overflow-style:none] sm:[scrollbar-width:thin] sm:[&::-webkit-scrollbar]:h-1.5 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-thumb]:bg-slate-300/80">
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="h-10 min-w-32 flex-1 sm:w-[160px] sm:flex-none sm:shrink-0">
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
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none sm:flex-nowrap [&>*]:min-w-32 [&>*]:flex-1 sm:[&>*]:min-w-0 sm:[&>*]:flex-none sm:[&>*]:shrink-0">
              {extraFilter}
            </div>
          ) : null}

          {viewToggle ? <div className="shrink-0 max-sm:w-full">{viewToggle}</div> : null}

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

        {filterTabs.length > 0 ? (
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden sm:flex-nowrap sm:overflow-x-auto sm:overscroll-x-contain sm:pb-1 sm:[-ms-overflow-style:none] sm:[scrollbar-width:thin] sm:[&::-webkit-scrollbar]:h-1.5 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-thumb]:bg-slate-300/80">
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
          </div>
        ) : null}
      </div>
      {activeFilters.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map((label) => (
            <span
              key={label}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
