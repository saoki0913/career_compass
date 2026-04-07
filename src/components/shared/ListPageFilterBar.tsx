"use client";

import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  filterTabs: FilterTab[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
  tabCounts: Record<string, number>;
  sortOptions: SortOption[];
  sortBy: string;
  onSortChange: (value: string) => void;
  extraFilter?: React.ReactNode;
  viewToggle?: React.ReactNode;
}

export function ListPageFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  filterTabs,
  activeFilter,
  onFilterChange,
  tabCounts,
  sortOptions,
  sortBy,
  onSortChange,
  extraFilter,
  viewToggle,
}: ListPageFilterBarProps) {
  return (
    <div className="mb-8 min-w-0 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,251,0.94))] p-4 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)] backdrop-blur-xl">
      <div className="min-w-0 pb-1">
        <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80">
          <div className="relative min-w-[10rem] max-w-[22rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200/80 bg-white pl-10 pr-4 text-sm shadow-[0_12px_28px_-24px_rgba(15,23,42,0.22)] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="h-10 w-[160px] shrink-0">
              <SelectValue placeholder="並び順" />
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
            <div className="flex shrink-0 items-center gap-2.5 [&>*]:min-w-0 [&>*]:shrink-0">
              {extraFilter}
            </div>
          ) : null}

          {viewToggle ? <div className="shrink-0">{viewToggle}</div> : null}

          {filterTabs.map((tab) => {
            const tabCount = tabCounts[tab.key] ?? 0;
            const isActive = activeFilter === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
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
      </div>
    </div>
  );
}
