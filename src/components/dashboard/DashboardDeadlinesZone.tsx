"use client";

import type { DeadlinesPageData } from "@/lib/dto/dashboard";
import { useDeadlines } from "@/hooks/useDeadlines";
import { DeadlineCard } from "@/components/dashboard/DeadlineCard";
import { DashboardDeadlinesSkeleton } from "@/components/skeletons/DashboardSkeleton";

type DashboardDeadlinesZoneProps = {
  initialDeadlines?: DeadlinesPageData;
};

export function DashboardDeadlinesZone({
  initialDeadlines,
}: DashboardDeadlinesZoneProps) {
  const { deadlines, isLoading } = useDeadlines(
    7,
    initialDeadlines && initialDeadlines.periodDays === 7 ? { initialData: initialDeadlines } : {},
  );

  if (isLoading && !initialDeadlines) {
    return <DashboardDeadlinesSkeleton />;
  }

  return <DeadlineCard deadlines={deadlines} maxVisible={4} />;
}
