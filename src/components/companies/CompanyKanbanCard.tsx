"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { Briefcase, Calendar, FileText, GripVertical, MoreHorizontal, Star, Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMPANY_SELECTION_PHASE_COLUMNS, getSelectionPhaseForStatus, getStatusConfig, type SelectionPhaseKey } from "@/lib/constants/status";
import { cn } from "@/lib/utils";
import type { Company } from "@/hooks/useCompanies";
import { getDeadlineSummary, getCompanyNameClass } from "@/components/companies/company-display";
import { CompanyLogo } from "@/components/companies/CompanyLogo";

const DEADLINE_TONE_CLASSES = {
  none: "text-muted-foreground",
  overdue: "text-destructive",
  urgent: "text-destructive",
  warning: "text-warning-foreground",
  normal: "text-muted-foreground",
} as const;

interface CompanyKanbanCardProps {
  company: Company;
  onMoveToPhase: (companyId: string, phaseKey: SelectionPhaseKey) => void;
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
  onDeleteStart?: (companyId: string) => void;
  isOverlay?: boolean;
}

function CompanyKanbanCardComponent({
  company,
  onMoveToPhase,
  onTogglePin,
  onDeleteStart,
  isOverlay = false,
}: CompanyKanbanCardProps) {
  const router = useRouter();
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: company.id,
    data: { companyId: company.id },
    disabled: isOverlay,
  });
  const status = getStatusConfig(company.status);
  const currentPhase = getSelectionPhaseForStatus(company.status);
  const deadline = getDeadlineSummary(company.nearestDeadline);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [role='button'], [data-radix-popper-content-wrapper]")) return;
        router.push(`/companies/${company.id}`);
      }}
      className={cn(
        "group cursor-pointer gap-0 overflow-hidden rounded-xl border-border/70 py-0 transition-all duration-200 hover:border-primary/30 hover:shadow-md",
        isDragging && "relative z-20 opacity-30 shadow-md ring-2 ring-primary/20",
        isOverlay && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex items-center justify-between gap-1 px-2 pt-2">
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${company.name} をドラッグして選考フェーズを移動`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            {onTogglePin ? (
              <button
                type="button"
                onClick={() => onTogglePin(company.id, !company.isPinned)}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-all duration-200 hover:scale-110 active:scale-95",
                  company.isPinned
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-muted-foreground/50 hover:text-amber-400"
                )}
                title={company.isPinned ? "お気に入り解除" : "お気に入りに追加"}
                aria-label={company.isPinned ? "お気に入り解除" : "お気に入りに追加"}
              >
                <Star className={cn("h-3.5 w-3.5 transition-all duration-200", company.isPinned && "fill-current")} />
              </button>
            ) : null}
          </div>
          {onDeleteStart ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDeleteStart(company.id)}
              aria-label={`${company.name} を削除`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2.5 px-2.5 pb-2 pt-1">
          <CompanyLogo company={company} className="h-10 w-10 shrink-0 rounded-lg" imageClassName="h-7 w-7" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/companies/${company.id}`}
              className={cn(
                "block min-w-0 truncate whitespace-nowrap font-bold text-foreground transition-colors underline-offset-2 hover:text-primary hover:underline",
                getCompanyNameClass(company.name)
              )}
              title={company.name}
            >
              {company.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <p className="text-[11px] text-muted-foreground">
                {company.industry || "業界未設定"}
              </p>
              <Badge
                variant="outline"
                className={cn("h-[18px] whitespace-nowrap rounded-full px-1.5 py-0 text-[10px] font-medium leading-[18px]", status.bgColor, status.color)}
              >
                {status.label}
              </Badge>
            </div>
          </div>
        </div>

        <div className={cn(
          "mx-2.5 mb-1.5 rounded-md px-2.5 py-1.5",
          deadline && (deadline.tone === "overdue" || deadline.tone === "urgent")
            ? "bg-destructive/10"
            : deadline?.tone === "warning"
              ? "bg-warning/10"
              : "bg-muted/30"
        )}>
          <div className={cn("flex items-center gap-1.5 text-[11px]", deadline ? DEADLINE_TONE_CLASSES[deadline.tone] : "text-muted-foreground")}>
            <Calendar className="h-3 w-3 shrink-0" />
            {deadline ? (
              <>
                <span className="truncate">{deadline.typeLabel}</span>
                <span className="shrink-0 font-semibold">{deadline.daysText}</span>
              </>
            ) : (
              <span>締切なし</span>
            )}
          </div>
        </div>

        <div className="mx-2.5 mb-1.5 flex items-center rounded-md border border-border/60 bg-background/60 p-1 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1 rounded border border-border/60 bg-card px-1.5 py-0.5">
            <Briefcase className="h-3 w-3 text-primary" />
            <span>{company.activeApplicationCount}</span>
          </span>
          <span className="mx-1.5 h-4 w-px bg-border/70" aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1 rounded border border-border/60 bg-card px-1.5 py-0.5">
            <FileText className="h-3 w-3 text-primary" />
            <span>{company.esDocumentCount}</span>
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span>
            更新: {new Date(company.updatedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" })}
          </span>
          <Popover open={phaseMenuOpen} onOpenChange={setPhaseMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground"
                aria-label={`${company.name} の選考フェーズを変更`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              {COMPANY_SELECTION_PHASE_COLUMNS.map((phase) => (
                <button
                  key={phase.key}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:bg-accent",
                    phase.key === currentPhase.key && "bg-accent/50"
                  )}
                  onClick={() => {
                    onMoveToPhase(company.id, phase.key);
                    setPhaseMenuOpen(false);
                  }}
                >
                  <span>{phase.label}</span>
                  {phase.key === currentPhase.key ? <span className="text-xs text-muted-foreground">現在</span> : null}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  );
}

export const CompanyKanbanCard = memo(CompanyKanbanCardComponent);
