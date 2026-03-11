"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  rank?: number;
  className?: string;
}

function getRankPresentation(rank?: number) {
  const normalizedRank = Number.isFinite(rank) && (rank ?? 0) > 0 ? Number(rank) : 1;

  if (normalizedRank <= 1) {
    return {
      rank: 1,
      label: "最優先",
      variant: "soft-primary" as const,
    };
  }

  if (normalizedRank === 2) {
    return {
      rank: 2,
      label: "次点",
      variant: "soft-info" as const,
    };
  }

  return {
    rank: normalizedRank,
    label: "補足",
    variant: "outline" as const,
  };
}

export function PriorityBadge({ rank, className }: PriorityBadgeProps) {
  const presentation = getRankPresentation(rank);

  return (
    <Badge
      variant={presentation.variant}
      className={cn("gap-1.5 px-2.5 py-1 text-[11px]", className)}
    >
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background/80 px-1 text-[10px] font-semibold text-foreground">
        {presentation.rank}
      </span>
      {presentation.label}
    </Badge>
  );
}

export default PriorityBadge;
