"use client";

import { useState } from "react";
import Link from "next/link";
import { useCompanies, Company, CompanyStatus } from "@/hooks/useCompanies";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Status configuration
const statusConfig: Record<CompanyStatus, { label: string; color: string; bgColor: string }> = {
  interested: { label: "興味あり", color: "text-slate-600", bgColor: "bg-slate-100" },
  applied: { label: "応募済", color: "text-blue-600", bgColor: "bg-blue-50" },
  interview: { label: "面接中", color: "text-purple-600", bgColor: "bg-purple-50" },
  offer: { label: "内定", color: "text-emerald-600", bgColor: "bg-emerald-50" },
  rejected: { label: "不合格", color: "text-red-600", bgColor: "bg-red-50" },
  withdrawn: { label: "辞退", color: "text-gray-500", bgColor: "bg-gray-100" },
};

// Filter tabs
const filterTabs = [
  { key: "all", label: "すべて" },
  { key: "interested", label: "興味あり" },
  { key: "applied", label: "応募済" },
  { key: "interview", label: "面接中" },
  { key: "offer", label: "内定" },
] as const;

type FilterKey = typeof filterTabs[number]["key"];

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-12 h-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// Company card component
function CompanyCard({ company }: { company: Company }) {
  const status = statusConfig[company.status];

  return (
    <Link href={`/companies/${company.id}`}>
      <Card className="group border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                  {company.name}
                </h3>
                <span
                  className={cn(
                    "flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium",
                    status.bgColor,
                    status.color
                  )}
                >
                  {status.label}
                </span>
              </div>

              {company.industry && (
                <p className="text-sm text-muted-foreground mb-3">{company.industry}</p>
              )}

              <div className="flex items-center gap-4 text-sm">
                {company.recruitmentUrl && (
                  <a
                    href={company.recruitmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLinkIcon />
                    採用ページ
                  </a>
                )}
                {company.corporateUrl && (
                  <a
                    href={company.corporateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                  >
                    <ExternalLinkIcon />
                    企業HP
                  </a>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
              <ChevronRightIcon />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Empty state component
function EmptyState({ filter, canAddMore }: { filter: FilterKey; canAddMore: boolean }) {
  const isFiltered = filter !== "all";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
        <BuildingIcon />
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
            <PlusIcon />
            <span className="ml-2">企業を追加する</span>
          </Link>
        </Button>
      )}
    </div>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 bg-muted/50 rounded-2xl animate-pulse" />
      ))}
    </div>
  );
}

export default function CompaniesPage() {
  const { companies, count, limit, canAddMore, isLoading, error } = useCompanies();
  const [filter, setFilter] = useState<FilterKey>("all");

  // Filter companies
  const filteredCompanies = filter === "all"
    ? companies
    : companies.filter((c) => c.status === filter);

  // Count by status
  const statusCounts = companies.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<CompanyStatus, number>);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">登録企業</h1>
            <p className="mt-1 text-muted-foreground">
              {limit
                ? `${count} / ${limit} 社登録中`
                : `${count} 社登録中`}
            </p>
          </div>

          {canAddMore && (
            <Button asChild className="sm:self-start">
              <Link href="/companies/new">
                <PlusIcon />
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

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {filterTabs.map((tab) => {
            const count = tab.key === "all"
              ? companies.length
              : statusCounts[tab.key as CompanyStatus] || 0;
            const isActive = filter === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
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
        ) : (
          <div className="space-y-4">
            {filteredCompanies.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
