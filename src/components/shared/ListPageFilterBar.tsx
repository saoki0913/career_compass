"use client";

import type { FormEvent, ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
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

type FilterBarLayoutKey = "default" | "companies" | "search" | "tasks";

const FILTER_BAR_CONTROL_ROW_CLASS: Record<FilterBarLayoutKey, string> = {
  default:
    "grid w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-2 lg:overflow-x-auto lg:overscroll-x-contain lg:pb-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar]:h-1.5 lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-slate-300/80",
  companies:
    "grid w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-2 lg:overflow-x-auto lg:overscroll-x-contain lg:pb-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar]:h-1.5 lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-slate-300/80",
  search: "grid w-full min-w-0 grid-cols-1 gap-2",
  tasks:
    "grid w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-2 lg:overflow-x-auto lg:overscroll-x-contain lg:pb-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar]:h-1.5 lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-slate-300/80",
};

const FILTER_BAR_SEARCH_CLASS: Record<FilterBarLayoutKey, string> = {
  default: "relative col-span-2 min-w-0 lg:min-w-[11rem] lg:max-w-[15rem] lg:flex-[0_1_14rem]",
  companies: "relative col-span-2 min-w-0 lg:w-[14rem] lg:flex-none xl:w-[16rem]",
  search: "relative min-w-0",
  tasks: "relative col-span-2 min-w-0 lg:min-w-[11rem] lg:max-w-[18rem] lg:flex-[0_1_14rem] xl:flex-[0_1_16rem]",
};

export interface FilterTab {
  key: string;
  label: string;
}

export interface SortOption {
  value: string;
  label: string;
}

type ListPageSortProps =
  | {
      sortOptions: SortOption[];
      sortBy: string;
      onSortChange: (value: string) => void;
    }
  | {
      sortOptions?: undefined;
      sortBy?: undefined;
      onSortChange?: undefined;
    };

type ListPageFilterBarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder: string;
  filterTabs?: FilterTab[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  tabCounts?: Record<string, number>;
  extraFilter?: ReactNode;
  viewToggle?: ReactNode;
  actions?: ReactNode;
  activeFilters?: string[];
  density?: "default" | "tasks";
  variant?: "default" | "companies" | "search" | "es";
  extraFilterLayout?: "pair" | "full";
  searchType?: "text" | "search";
  searchAutoFocus?: boolean;
  searchLoading?: boolean;
  onSearchSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onSearchClear?: () => void;
  clearAction?: {
    label?: string;
    onClear: () => void;
  };
} & ListPageSortProps;

export function ListPageFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  filterTabs = [],
  activeFilter,
  onFilterChange,
  tabCounts = {},
  sortOptions = [],
  sortBy,
  onSortChange,
  extraFilter,
  viewToggle,
  actions,
  activeFilters = [],
  density = "default",
  variant = "default",
  extraFilterLayout = variant === "companies" || density === "tasks" ? "pair" : "full",
  searchType = "text",
  searchAutoFocus = false,
  searchLoading = false,
  onSearchSubmit,
  onSearchClear,
  clearAction,
}: ListPageFilterBarProps) {
  const selectedSortLabel = sortOptions.find((option) => option.value === sortBy)?.label ?? "並び順";
  const hasStatusRow = filterTabs.length > 0 || activeFilters.length > 0;
  const layoutKey: FilterBarLayoutKey =
    variant === "search" ? "search" : variant === "companies" ? "companies" : density === "tasks" ? "tasks" : "default";
  const hasSort = sortOptions.length > 0 && sortBy !== undefined && onSortChange !== undefined;
  const controlRowClass = FILTER_BAR_CONTROL_ROW_CLASS[layoutKey];
  const searchClass = FILTER_BAR_SEARCH_CLASS[layoutKey];
  const searchField = (
    <>
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground lg:left-3 lg:h-4 lg:w-4" />
      <input
        type={searchType}
        aria-label={searchPlaceholder}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        autoFocus={searchAutoFocus}
        className={cn(
          "w-full rounded-[1.1rem] border border-slate-200 bg-white pl-12 pr-4 text-[15px] shadow-[0_14px_34px_-28px_rgba(15,23,42,0.55)] transition-colors placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 lg:rounded-xl lg:pl-10 lg:text-sm",
          "h-[52px] lg:h-9",
          (onSearchClear || searchLoading) && "pr-12",
        )}
      />
      {onSearchClear || searchLoading ? (
        <button
          type="button"
          onClick={onSearchClear}
          disabled={searchLoading && !onSearchClear}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={onSearchClear ? "検索をクリア" : "検索中"}
        >
          {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      ) : null}
    </>
  );
  const sortControl = hasSort ? (
    <Select value={sortBy} onValueChange={onSortChange}>
      <SelectTrigger
        className={cn(
          "h-12 min-w-0 shrink-0 rounded-xl lg:h-9",
          layoutKey === "companies" ? "w-full lg:w-[170px]" : "w-full lg:w-[150px]",
          density === "tasks" && "xl:w-[180px]",
        )}
      >
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
  ) : null;

  const statusControls = hasStatusRow ? (
    <div className={FILTER_BAR_SCROLL_ROW_CLASS}>
      {filterTabs.map((tab) => {
        const tabCount = tabCounts[tab.key] ?? 0;
        const isActive = activeFilter === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onFilterChange?.(tab.key)}
            aria-pressed={isActive}
            className={cn(
              "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-all duration-200 lg:h-8 lg:px-3 lg:text-xs",
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
  ) : null;

  return (
    <div
      className={cn(
        "mb-4 min-w-0 max-w-full overflow-hidden sm:mb-5",
        "rounded-[1.1rem] border border-slate-200/80 bg-white/92 p-3 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:px-3 lg:py-2.5",
        density === "tasks" && "sm:p-4 xl:p-5",
      )}
    >
      <div className="min-w-0 space-y-2">
        <div className={controlRowClass}>
          {onSearchSubmit ? (
            <form onSubmit={onSearchSubmit} className={searchClass}>
              {searchField}
            </form>
          ) : (
            <div className={searchClass}>{searchField}</div>
          )}

          {sortControl}

          {extraFilter ? (
            <div
              className={cn(
                "grid min-w-0 grid-cols-1 gap-2 [&>*]:min-w-0 [&>*]:w-full lg:contents lg:[&>*]:w-auto lg:[&>*]:shrink-0",
                extraFilterLayout === "full" ? "col-span-2 grid-cols-2" : "col-span-1",
              )}
            >
              {extraFilter}
            </div>
          ) : null}

          {viewToggle ? <div className="col-span-2 min-w-0 shrink-0 lg:w-auto">{viewToggle}</div> : null}

          {clearAction ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAction.onClear}
              className="col-span-2 h-11 shrink-0 rounded-xl text-muted-foreground lg:h-9"
            >
              <X className="h-4 w-4" />
              {clearAction.label ?? "クリア"}
            </Button>
          ) : null}

          {actions ? (
            <div className="col-span-2 flex shrink-0 items-center justify-end gap-2 lg:ml-auto">{actions}</div>
          ) : null}
        </div>
        {statusControls}
      </div>
    </div>
  );
}
