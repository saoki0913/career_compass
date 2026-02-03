/**
 * CompanyGrid Component
 *
 * Responsive 4-column grid layout for company cards
 */

"use client";

import { CompanyCard } from "./CompanyCard";
import type { Company } from "@/hooks/useCompanies";

interface CompanyGridProps {
  companies: Company[];
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
}

export function CompanyGrid({ companies, onTogglePin }: CompanyGridProps) {
  if (companies.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
      {companies.map((company) => (
        <CompanyCard key={company.id} company={company} onTogglePin={onTogglePin} />
      ))}
    </div>
  );
}
