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
import {
  FILTER_BAR_ACTIONS_CLASS,
  FILTER_BAR_ACTIVE_FILTER_MOBILE_CLASS,
  FILTER_BAR_ACTIVE_FILTER_SUMMARY_CLASS,
  FILTER_BAR_CONTROL_ROW_CLASS,
  FILTER_BAR_EXTRA_FILTER_CLASS,
  FILTER_BAR_INNER_CLASS,
  FILTER_BAR_INPUT_CLASS,
  FILTER_BAR_SEARCH_CLASS,
  FILTER_BAR_SELECT_TRIGGER_CLASS,
  FILTER_BAR_SHELL_CLASS,
  FILTER_BAR_STATUS_COUNT_CLASS,
  FILTER_BAR_STATUS_ROW_CLASS,
  FILTER_BAR_STATUS_TAB_CLASS,
  FILTER_BAR_SURFACE_CLASS,
  FILTER_BAR_VIEW_TOGGLE_SLOT_CLASS,
  resolveFilterBarLayoutKey,
  type FilterBarDensity,
  type FilterBarVariant,
} from "@/components/shared/list-page-filter-bar-layout";
import { cn } from "@/lib/utils";

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
  density?: FilterBarDensity;
  variant?: FilterBarVariant;
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
  const layoutKey = resolveFilterBarLayoutKey({ density, variant });
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
          FILTER_BAR_INPUT_CLASS,
          (onSearchClear || searchLoading) && "pr-12 lg:pr-9",
        )}
      />
      {onSearchClear || searchLoading ? (
        <button
          type="button"
          onClick={onSearchClear}
          disabled={searchLoading && !onSearchClear}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:right-1 lg:h-7 lg:w-7 lg:rounded-lg"
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
          FILTER_BAR_SELECT_TRIGGER_CLASS,
          "w-full",
          layoutKey === "tasks" && "lg:w-[7.5rem]",
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
    <div className={FILTER_BAR_STATUS_ROW_CLASS}>
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
              FILTER_BAR_STATUS_TAB_CLASS,
              isActive
                ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white shadow-[0_18px_36px_-26px_rgba(15,23,42,0.64)]"
                : "border border-slate-200/80 bg-white/92 text-slate-500 hover:border-slate-300 hover:text-slate-900"
            )}
          >
            <span className="min-w-0 truncate">{tab.label}</span>
            <span
              className={cn(
                FILTER_BAR_STATUS_COUNT_CLASS,
                isActive ? "bg-white/16 text-white" : "bg-slate-100 text-slate-500"
              )}
            >
              {tabCount}
            </span>
          </button>
        );
      })}
      {filterTabs.length > 0 && activeFilters.length > 0 ? (
        <span className="h-5 w-px shrink-0 bg-border lg:hidden" aria-hidden="true" />
      ) : null}
      {activeFilters.map((label) => (
        <span
          key={label}
          className={FILTER_BAR_ACTIVE_FILTER_MOBILE_CLASS}
        >
          {label}
        </span>
      ))}
      {activeFilters.length > 0 ? (
        <span
          className={FILTER_BAR_ACTIVE_FILTER_SUMMARY_CLASS}
          title={activeFilters.join(" / ")}
          aria-label={`適用中の条件: ${activeFilters.join("、")}`}
        >
          条件 {activeFilters.length}
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        FILTER_BAR_SHELL_CLASS,
        FILTER_BAR_SURFACE_CLASS,
        density === "tasks" && "sm:p-4 lg:px-2 lg:py-1.5",
      )}
    >
      <div className={FILTER_BAR_INNER_CLASS}>
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
                FILTER_BAR_EXTRA_FILTER_CLASS,
                extraFilterLayout === "full" ? "col-span-2 grid-cols-2" : "col-span-1",
              )}
            >
              {extraFilter}
            </div>
          ) : null}

          {viewToggle ? <div className={FILTER_BAR_VIEW_TOGGLE_SLOT_CLASS}>{viewToggle}</div> : null}

          {clearAction ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAction.onClear}
              className="col-span-2 h-11 shrink-0 rounded-xl text-muted-foreground lg:col-span-1 lg:h-8 lg:px-2 lg:text-xs"
            >
              <X className="h-4 w-4" />
              {clearAction.label ?? "クリア"}
            </Button>
          ) : null}

          {actions ? (
            <div className={FILTER_BAR_ACTIONS_CLASS}>{actions}</div>
          ) : null}

          {statusControls}
        </div>
      </div>
    </div>
  );
}
