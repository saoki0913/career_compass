"use client";

import type { CompaniesPageData } from "@/lib/dto/dashboard";
import { useCompanies } from "@/hooks/useCompanies";
import { CompanyProgressCard } from "@/components/dashboard/CompanyListCard";
import { DashboardPipelineSkeleton } from "@/components/skeletons/DashboardSkeleton";

type DashboardPipelineZoneProps = {
  initialCompanies?: CompaniesPageData;
};

export function DashboardPipelineZone({
  initialCompanies,
}: DashboardPipelineZoneProps) {
  const { companies, isLoading } = useCompanies(initialCompanies ? { initialData: initialCompanies } : {});

  if (isLoading && !initialCompanies) {
    return <DashboardPipelineSkeleton />;
  }

  return <CompanyProgressCard companies={companies} />;
}

