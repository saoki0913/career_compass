/**
 * IndustryGroup Component
 *
 * Groups companies by industry with 4-column grid layout
 */

"use client";

import { useMemo } from "react";
import { CompanyCard } from "./CompanyCard";
import type { Company } from "@/hooks/useCompanies";

interface IndustryGroupProps {
  companies: Company[];
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
}

interface GroupedCompanies {
  industry: string;
  companies: Company[];
}

export function IndustryGroup({ companies, onTogglePin }: IndustryGroupProps) {
  // Group companies by industry
  const groupedCompanies = useMemo(() => {
    const groups = new Map<string, Company[]>();

    for (const company of companies) {
      const industry = company.industry || "未分類";
      if (!groups.has(industry)) {
        groups.set(industry, []);
      }
      groups.get(industry)!.push(company);
    }

    // Sort: Named industries first (alphabetically), then "未分類" at the end
    const result: GroupedCompanies[] = [];
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "未分類") return 1;
      if (b === "未分類") return -1;
      return a.localeCompare(b, "ja");
    });

    for (const key of sortedKeys) {
      result.push({
        industry: key,
        companies: groups.get(key)!,
      });
    }

    return result;
  }, [companies]);

  if (companies.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {groupedCompanies.map((group) => (
        <div key={group.industry}>
          {/* Industry Header */}
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {group.industry}
            </h2>
            <span className="text-sm text-muted-foreground">
              ({group.companies.length})
            </span>
          </div>

          {/* Companies Grid - 4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {group.companies.map((company) => (
              <CompanyCard key={company.id} company={company} onTogglePin={onTogglePin} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
