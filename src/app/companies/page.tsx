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
import {
  ListPageFilterBar,
  ListPageSkeleton,
  ListPageEmptyState,
  FavoritesSection,
  ViewToggle,
} from "@/components/shared";
import { Plus, Building2, LayoutGrid, Layers } from "lucide-react";
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
];

type FilterKey = "all" | StatusCategory;

// Sort options
const sortOptions = [
  { value: "date_desc", label: "追加日 (新しい順)" },
  { value: "date_asc", label: "追加日 (古い順)" },
  { value: "name_asc", label: "企業名 (あ→わ)" },
  { value: "name_desc", label: "企業名 (わ→あ)" },
];

type SortKey = typeof sortOptions[number]["value"];

// Industry options for multi-select
const industryOptions = INDUSTRIES.map((industry) => ({
  value: industry,
  label: industry,
}));

// View toggle options
const viewOptions = [
  { key: "grid", icon: <LayoutGrid className="w-4 h-4" />, label: "グリッド表示" },
  { key: "industry", icon: <Layers className="w-4 h-4" />, label: "業界別表示" },
];

export default function CompaniesPage() {
  const { companies, count, limit, canAddMore, isLoading, error, togglePin } = useCompanies();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");

  // Filter companies by category, industry, and search query
  const filteredCompanies = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filtered = companies
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

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date_asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name_asc":
          return a.name.localeCompare(b.name, "ja");
        case "name_desc":
          return b.name.localeCompare(a.name, "ja");
        default:
          return 0;
      }
    });

    return sorted;
  }, [companies, filter, selectedIndustries, searchQuery, sortBy]);

  // Split into pinned and unpinned for Visual Hierarchy
  const { pinnedCompanies, unpinnedCompanies } = useMemo(() => {
    const pinned = filteredCompanies.filter((c) => c.isPinned);
    const unpinned = filteredCompanies.filter((c) => !c.isPinned);
    return { pinnedCompanies: pinned, unpinnedCompanies: unpinned };
  }, [filteredCompanies]);

  // Count by category
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: companies.length,
    };
    for (const c of companies) {
      const category = getStatusCategory(c.status);
      counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [companies]);

  const isFiltered = filter !== "all" || searchQuery !== "" || selectedIndustries.length > 0;

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
        <ListPageFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="企業名で検索..."
          filterTabs={filterTabs}
          activeFilter={filter}
          onFilterChange={(key) => setFilter(key as FilterKey)}
          tabCounts={tabCounts}
          sortOptions={sortOptions}
          sortBy={sortBy}
          onSortChange={(value) => setSortBy(value as SortKey)}
          extraFilter={
            <MultiSelect
              options={industryOptions}
              selected={selectedIndustries}
              onChange={setSelectedIndustries}
              placeholder="業界"
              className="w-[160px]"
            />
          }
          viewToggle={
            <ViewToggle
              options={viewOptions}
              activeKey={viewMode}
              onChange={setViewMode}
            />
          }
        />

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
          <ListPageSkeleton />
        ) : filteredCompanies.length === 0 ? (
          <ListPageEmptyState
            icon={<Building2 className="w-12 h-12 text-muted-foreground/50" />}
            title={isFiltered ? "該当する企業がありません" : "まだ企業が登録されていません"}
            description={
              isFiltered
                ? "フィルターを変更するか、新しい企業を追加してください"
                : "志望企業を登録して、ES提出や面接の締切を管理しましょう"
            }
            action={
              canAddMore
                ? {
                    label: "企業を追加する",
                    icon: <Plus className="w-5 h-5" />,
                    href: "/companies/new",
                  }
                : undefined
            }
          />
        ) : viewMode === "industry" ? (
          <IndustryGroup companies={filteredCompanies} onTogglePin={togglePin} />
        ) : (
          <div className="space-y-8">
            {/* Favorites Section */}
            <FavoritesSection count={pinnedCompanies.length}>
              <CompanyGrid companies={pinnedCompanies} onTogglePin={togglePin} />
            </FavoritesSection>

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
