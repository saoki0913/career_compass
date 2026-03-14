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
    <div className="bg-card/50 backdrop-blur-sm rounded-xl p-4 border border-border/50 mb-8">
      {/* Search bar - Mobile: full width above tabs */}
      <div className="mb-4 sm:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Search bar - Desktop: inline with tabs */}
        <div className="hidden sm:block relative w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-10 pr-4 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 flex-1">
          {filterTabs.map((tab) => {
            const tabCount = tabCounts[tab.key] ?? 0;
            const isActive = activeFilter === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => onFilterChange(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  )}
                >
                  {tabCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort, Extra filter + View toggle */}
        <div className="flex items-center gap-3">
          {/* Sort dropdown */}
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[180px]">
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

          {/* Extra filter slot (e.g., multi-select for industry/company) */}
          {extraFilter}

          {/* View toggle slot */}
          {viewToggle}
        </div>
      </div>
    </div>
  );
}
