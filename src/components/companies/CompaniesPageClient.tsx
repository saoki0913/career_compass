"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Building2, LayoutGrid, Layers } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CompanyGrid } from "@/components/companies/CompanyGrid";
import { IndustryGroup } from "@/components/companies/IndustryGroup";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListPageFilterBar } from "@/components/shared/ListPageFilterBar";
import { CompaniesListContentSkeleton } from "@/components/skeletons/CompaniesListContentSkeleton";
import { ListPageEmptyState } from "@/components/shared/ListPageEmptyState";
import { FavoritesSection } from "@/components/shared/FavoritesSection";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { useCompanies, type Company } from "@/hooks/useCompanies";
import { getStatusCategory, type StatusCategory } from "@/lib/constants/status";
import { INDUSTRIES } from "@/lib/constants/industries";

const filterTabs = [
  { key: "all", label: "すべて" },
  { key: "not_started", label: "未着手" },
  { key: "in_progress", label: "進行中" },
  { key: "completed", label: "完了" },
];

type FilterKey = "all" | StatusCategory;

const sortOptions = [
  { value: "date_desc", label: "追加日 (新しい順)" },
  { value: "date_asc", label: "追加日 (古い順)" },
  { value: "name_asc", label: "企業名 (あ→わ)" },
  { value: "name_desc", label: "企業名 (わ→あ)" },
];

type SortKey = typeof sortOptions[number]["value"];

const industryOptions = INDUSTRIES.map((industry) => ({
  value: industry,
  label: industry,
}));

const viewOptions = [
  { key: "grid", icon: <LayoutGrid className="w-4 h-4" />, label: "グリッド表示" },
  { key: "industry", icon: <Layers className="w-4 h-4" />, label: "業界別表示" },
];

type CompaniesPageClientProps = {
  initialData?: {
    companies: Company[];
    count: number;
    limit: number | null;
    canAddMore: boolean;
  };
};

export function CompaniesPageClient({ initialData }: CompaniesPageClientProps) {
  const { companies, count, limit, isLoading, error, togglePin } = useCompanies(
    initialData ? { initialData } : {}
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filtered = companies
      .filter((company) => filter === "all" || getStatusCategory(company.status) === filter)
      .filter(
        (company) =>
          selectedIndustries.length === 0 ||
          (company.industry && selectedIndustries.includes(company.industry))
      )
      .filter(
        (company) =>
          normalizedQuery === "" || company.name.toLowerCase().includes(normalizedQuery)
      );

    return [...filtered].sort((a, b) => {
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
  }, [companies, filter, searchQuery, selectedIndustries, sortBy]);

  const { pinnedCompanies, unpinnedCompanies } = useMemo(() => {
    const pinned = filteredCompanies.filter((company) => company.isPinned);
    const unpinned = filteredCompanies.filter((company) => !company.isPinned);
    return { pinnedCompanies: pinned, unpinnedCompanies: unpinned };
  }, [filteredCompanies]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: companies.length };
    for (const company of companies) {
      const category = getStatusCategory(company.status);
      counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [companies]);

  const isFiltered = filter !== "all" || searchQuery !== "" || selectedIndustries.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {isLoading ? (
          <CompaniesListContentSkeleton />
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">登録企業</h1>
                <p className="mt-1 text-muted-foreground">
                  {limit ? `${count} / ${limit} 社登録中` : `${count} 社登録中`}
                </p>
              </div>

              <Button asChild className="sm:self-start">
                <Link href="/companies/new">
                  <Plus className="w-5 h-5" />
                  <span className="ml-2">企業を追加</span>
                </Link>
              </Button>
            </div>

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
              viewToggle={<ViewToggle options={viewOptions} activeKey={viewMode} onChange={setViewMode} />}
            />

            {error && (
              <Card className="mb-6 border-red-200 bg-red-50/50">
                <CardContent className="py-4">
                  <p className="text-sm text-red-800">{error}</p>
                </CardContent>
              </Card>
            )}

            {filteredCompanies.length === 0 ? (
              <ListPageEmptyState
                icon={<Building2 className="w-12 h-12 text-muted-foreground/50" />}
                title={isFiltered ? "該当する企業がありません" : "まだ企業が登録されていません"}
                description={
                  isFiltered
                    ? "フィルターを変更するか、新しい企業を追加してください"
                    : "志望企業を登録して、ES提出や面接の締切を管理しましょう"
                }
                action={
                  {
                    label: "企業を追加する",
                    icon: <Plus className="w-5 h-5" />,
                    href: "/companies/new",
                  }
                }
              />
            ) : viewMode === "industry" ? (
              <IndustryGroup companies={filteredCompanies} onTogglePin={togglePin} />
            ) : (
              <div className="space-y-8">
                <FavoritesSection count={pinnedCompanies.length}>
                  <CompanyGrid companies={pinnedCompanies} onTogglePin={togglePin} />
                </FavoritesSection>

                {unpinnedCompanies.length > 0 && (
                  <section>
                    {pinnedCompanies.length > 0 && (
                      <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">すべての企業</h2>
                        <span className="text-sm text-muted-foreground">({unpinnedCompanies.length})</span>
                      </div>
                    )}
                    <CompanyGrid companies={unpinnedCompanies} onTogglePin={togglePin} />
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
