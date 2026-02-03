"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCompanies } from "@/hooks/useCompanies";
import { DashboardHeader } from "@/components/dashboard";
import { CompanyGrid } from "@/components/companies/CompanyGrid";
import { IndustryGroup } from "@/components/companies/IndustryGroup";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Building2, LayoutGrid, Layers, Search, Star } from "lucide-react";
import {
  StatusCategory,
  getStatusCategory,
} from "@/lib/constants/status";
import { INDUSTRIES } from "@/lib/constants/industries";

// Filter tabs - by category
const filterTabs = [
  { key: "all", label: "すべて" },
  { key: "not_started", label: "未着手" },
  { key: "in_progress", label: "進行中" },
  { key: "completed", label: "完了" },
] as const;

type FilterKey = "all" | StatusCategory;

// Industry options for multi-select
const industryOptions = INDUSTRIES.map((industry) => ({
  value: industry,
  label: industry,
}));

// Empty state component
function EmptyState({ filter, canAddMore }: { filter: FilterKey; canAddMore: boolean }) {
  const isFiltered = filter !== "all";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
        <Building2 className="w-12 h-12 text-muted-foreground/50" />
      </div>
      <h3 className="text-lg font-medium mb-2">
        {isFiltered ? "該当する企業がありません" : "まだ企業が登録されていません"}
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        {isFiltered
          ? "フィルターを変更するか、新しい企業を追加してください"
          : "志望企業を登録して、ES提出や面接の締切を管理しましょう"}
      </p>
      {canAddMore && (
        <Button asChild>
          <Link href="/companies/new">
            <Plus className="w-5 h-5" />
            <span className="ml-2">企業を追加する</span>
          </Link>
        </Button>
      )}
    </div>
  );
}

// Loading skeleton for 4-column grid
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

export default function CompaniesPage() {
  const { companies, count, limit, canAddMore, isLoading, error, togglePin } = useCompanies();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [groupByIndustry, setGroupByIndustry] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter companies by category, industry, and search query
  const filteredCompanies = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    return companies
      .filter((c) => filter === "all" || getStatusCategory(c.status) === filter)
      .filter(
        (c) =>
          selectedIndustries.length === 0 ||
          (c.industry && selectedIndustries.includes(c.industry))
      )
      .filter(
        (c) =>
          normalizedQuery === "" ||
          c.name.toLowerCase().includes(normalizedQuery)
      );
  }, [companies, filter, selectedIndustries, searchQuery]);

  // Split into pinned and unpinned for Visual Hierarchy
  const { pinnedCompanies, unpinnedCompanies } = useMemo(() => {
    const pinned = filteredCompanies.filter((c) => c.isPinned);
    const unpinned = filteredCompanies.filter((c) => !c.isPinned);
    return { pinnedCompanies: pinned, unpinnedCompanies: unpinned };
  }, [filteredCompanies]);

  // Count by category
  const categoryCounts = useMemo(() => {
    return companies.reduce(
      (acc, c) => {
        const category = getStatusCategory(c.status);
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {} as Record<StatusCategory, number>
    );
  }, [companies]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">登録企業</h1>
            <p className="mt-1 text-muted-foreground">
              {limit ? `${count} / ${limit} 社登録中` : `${count} 社登録中`}
            </p>
          </div>

          {canAddMore && (
            <Button asChild className="sm:self-start">
              <Link href="/companies/new">
                <Plus className="w-5 h-5" />
                <span className="ml-2">企業を追加</span>
              </Link>
            </Button>
          )}
        </div>

        {/* Limit warning */}
        {!canAddMore && (
          <Card className="mb-6 border-orange-200 bg-orange-50/50">
            <CardContent className="py-4">
              <p className="text-sm text-orange-800">
                登録企業数が上限（{limit}社）に達しています。
                <Link href="/settings/plan" className="text-primary hover:underline ml-1">
                  プランをアップグレード
                </Link>
                すると無制限に登録できます。
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filter row */}
        <div className="bg-card/50 backdrop-blur-sm rounded-xl p-4 border border-border/50 mb-8">
          {/* Search bar - Mobile: full width above tabs */}
          <div className="mb-4 sm:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="企業名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                placeholder="企業名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-10 pr-4 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>

            {/* Status filter tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 flex-1">
              {filterTabs.map((tab) => {
                const tabCount =
                  tab.key === "all"
                    ? companies.length
                    : categoryCounts[tab.key as StatusCategory] || 0;
                const isActive = filter === tab.key;

                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
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

            {/* Industry filter + View toggle */}
            <div className="flex items-center gap-3">
              {/* Industry multi-select */}
              <MultiSelect
                options={industryOptions}
                selected={selectedIndustries}
                onChange={setSelectedIndustries}
                placeholder="業界"
                className="w-[160px]"
              />

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                <button
                  onClick={() => setGroupByIndustry(false)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                    !groupByIndustry
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="グリッド表示"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setGroupByIndustry(true)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                    groupByIndustry
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="業界別表示"
                >
                  <Layers className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50/50">
            <CardContent className="py-4">
              <p className="text-sm text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : filteredCompanies.length === 0 ? (
          <EmptyState filter={filter} canAddMore={canAddMore} />
        ) : groupByIndustry ? (
          <IndustryGroup companies={filteredCompanies} onTogglePin={togglePin} />
        ) : (
          <div className="space-y-8">
            {/* Favorites Section - Visual Hierarchy: pinned companies stand out */}
            {pinnedCompanies.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    お気に入り
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    ({pinnedCompanies.length})
                  </span>
                </div>
                <div className="p-4 -m-4 mb-4 rounded-xl bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent">
                  <CompanyGrid companies={pinnedCompanies} onTogglePin={togglePin} />
                </div>
              </section>
            )}

            {/* All Companies Section */}
            {unpinnedCompanies.length > 0 && (
              <section>
                {pinnedCompanies.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      すべての企業
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({unpinnedCompanies.length})
                    </span>
                  </div>
                )}
                <CompanyGrid companies={unpinnedCompanies} onTogglePin={togglePin} />
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
