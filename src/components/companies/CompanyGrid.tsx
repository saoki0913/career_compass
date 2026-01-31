/**
 * CompanyGrid Component
 *
 * Responsive 5-column grid layout for company cards
 */

"use client";

import { CompanyCard } from "./CompanyCard";
import type { Company } from "@/hooks/useCompanies";

interface CompanyGridProps {
  companies: Company[];
}

export function CompanyGrid({ companies }: CompanyGridProps) {
  if (companies.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {companies.map((company) => (
        <CompanyCard key={company.id} company={company} />
      ))}
    </div>
  );
}
