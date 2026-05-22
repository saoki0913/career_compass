"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { CompanyKanbanCard } from "@/components/companies/CompanyKanbanCard";
import { cn } from "@/lib/utils";
import type { Company } from "@/hooks/useCompanies";
import type { SelectionPhaseConfig, SelectionPhaseKey } from "@/lib/constants/status";

const COLUMN_HEADER_COLORS: Record<SelectionPhaseConfig["color"], string> = {
  slate: "bg-[linear-gradient(135deg,#475569,#64748b)] text-white",
  blue: "bg-[linear-gradient(135deg,#0f7cff,#2563eb)] text-white",
  purple: "bg-[linear-gradient(135deg,#a21caf,#9333ea)] text-white",
  amber: "bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-white",
  green: "bg-[linear-gradient(135deg,#10b981,#059669)] text-white",
};

const COLUMN_COUNT_COLORS: Record<SelectionPhaseConfig["color"], string> = {
  slate: "text-slate-600",
  blue: "text-blue-600",
  purple: "text-purple-600",
  amber: "text-amber-600",
  green: "text-emerald-600",
};

interface CompanyKanbanColumnProps {
  phase: SelectionPhaseConfig;
  companies: Company[];
  onMoveToPhase: (companyId: string, phaseKey: SelectionPhaseKey) => void;
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
  onDeleteStart?: (companyId: string) => void;
}

function CompanyKanbanColumnComponent({
  phase,
  companies,
  onMoveToPhase,
  onTogglePin,
  onDeleteStart,
}: CompanyKanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: phase.key });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${phase.label}の企業`}
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-[1.15rem] border border-border/70 bg-muted/20 p-2 transition-colors",
        "md:min-h-[30rem] xl:min-h-[36rem]",
        isOver && "border-primary/40 bg-primary/5 ring-2 ring-primary/20"
      )}
    >
      <div className={cn("flex h-10 items-center gap-2 rounded-xl px-4 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.9)] sm:h-11 lg:h-10 lg:px-3", COLUMN_HEADER_COLORS[phase.color])}>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold lg:text-sm">{phase.label}</h2>
        <span className={cn("rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold", COLUMN_COUNT_COLORS[phase.color])}>
          {companies.length}
        </span>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
        {companies.map((company) => (
          <CompanyKanbanCard
            key={company.id}
            company={company}
            onMoveToPhase={onMoveToPhase}
            onTogglePin={onTogglePin}
            onDeleteStart={onDeleteStart}
          />
        ))}

        {companies.length === 0 ? (
          <div
            className={cn(
              "flex min-h-20 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/60 px-4 py-4 text-center text-xs text-muted-foreground sm:min-h-32 lg:min-h-0",
              isOver && "border-primary/50 bg-primary/5 text-primary"
            )}
          >
            <Plus className="mb-2 h-4 w-4" />
            <span>このフェーズの企業はありません</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const CompanyKanbanColumn = memo(CompanyKanbanColumnComponent);
