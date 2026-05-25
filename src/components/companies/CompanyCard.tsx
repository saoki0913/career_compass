/**
 * CompanyCard Component
 *
 * Compact company card for 5-column grid layout
 */

"use client";

import { memo, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Company } from "@/hooks/useCompanies";
import { getStatusConfig } from "@/lib/constants/status";
import { getCompanyNameClass, getDeadlineSummary } from "@/components/companies/company-display";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import {
  Calendar,
  Briefcase,
  FileText,
  ExternalLink,
  MoreHorizontal,
  Star,
  Trash2,
} from "lucide-react";

interface CompanyCardProps {
  company: Company;
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
  onDeleteStart?: (companyId: string) => void;
}

function CompanyCardComponent({ company, onTogglePin, onDeleteStart }: CompanyCardProps) {
  const router = useRouter();
  const status = company.status || "inbox";
  const statusConfig = getStatusConfig(status);
  const companyHref = `/companies/${company.id}`;

  const navigateToCompany = () => {
    router.push(companyHref);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, [role='button'], [data-radix-popper-content-wrapper]")) return;
    event.preventDefault();
    navigateToCompany();
  };

  return (
    <Card
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [role='button'], [data-radix-popper-content-wrapper]")) return;
        navigateToCompany();
      }}
      onKeyDown={handleCardKeyDown}
      role="link"
      tabIndex={0}
      aria-label={`${company.name} の詳細を見る`}
      className="group h-full cursor-pointer overflow-hidden rounded-[1.1rem] border-border/70 py-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
    >
      <CardContent className="flex h-full flex-col p-2.5">
          {/* Action row: Star + Delete */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex shrink-0 items-center gap-0.5">
              {onTogglePin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onTogglePin(company.id, !company.isPinned);
                  }}
                  aria-pressed={company.isPinned}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 hover:bg-slate-100 hover:scale-105 active:scale-95",
                    company.isPinned
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-muted-foreground/50 hover:text-amber-400"
                  )}
                  title={company.isPinned ? `${company.name} のお気に入りを解除` : `${company.name} をお気に入りに追加`}
                  aria-label={company.isPinned ? `${company.name} のお気に入りを解除` : `${company.name} をお気に入りに追加`}
                >
                  <Star className={cn("h-3.5 w-3.5 transition-all duration-200", company.isPinned && "fill-current")} />
                </button>
              )}
            </div>
            {onDeleteStart && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDeleteStart(company.id);
                }}
                aria-label={`${company.name} を削除`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Company info: Logo + Name/Industry/Badge */}
          <div className="flex min-w-0 items-center gap-2.5 pb-1.5 pt-1">
            <CompanyLogo company={company} className="h-10 w-10 shrink-0 rounded-lg" imageClassName="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <Link
                href={companyHref}
                className={cn(
                  "block min-w-0 truncate whitespace-nowrap font-bold text-foreground underline-offset-2 transition-colors group-hover:text-primary hover:underline",
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
                  className={cn("h-[18px] whitespace-nowrap rounded-full px-1.5 py-0 text-[10px] font-medium leading-[18px]", statusConfig.bgColor, statusConfig.color)}
                >
                  {statusConfig.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Deadline */}
          {(() => {
            const deadline = getDeadlineSummary(company.nearestDeadline);
            const bgClass = deadline
              ? deadline.tone === "overdue" || deadline.tone === "urgent"
                ? "bg-destructive/10"
                : deadline.tone === "warning"
                  ? "bg-warning/10"
                  : "bg-muted/30"
              : "bg-muted/30";
            const toneClass = deadline
              ? deadline.tone === "overdue" || deadline.tone === "urgent"
                ? "text-destructive"
                : deadline.tone === "warning"
                  ? "text-warning-foreground"
                  : "text-muted-foreground"
              : "text-muted-foreground";
            return (
              <div className={cn("mb-1.5 rounded-md px-2.5 py-1.5", bgClass)}>
                <div className={cn("flex items-center gap-1.5 text-[11px]", toneClass)}>
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
            );
          })()}

          {/* Stats with bordered boxes */}
          <div className="mb-1.5 flex items-center rounded-md border border-border/60 bg-background/60 p-1 text-[11px] text-muted-foreground">
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

          {/* Footer: Date + Popover menu */}
          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
            <span>
              更新: {new Date(company.updatedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" })}
            </span>
            {(company.recruitmentUrl || company.corporateUrl) ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); }}
                    aria-label={`${company.name} の関連リンクを開く`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
                  {company.recruitmentUrl && (
                    <a
                      href={company.recruitmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      採用ページ
                    </a>
                  )}
                  {company.corporateUrl && (
                    <a
                      href={company.corporateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      企業HP
                    </a>
                  )}
                </PopoverContent>
              </Popover>
            ) : (
              <div className="h-11 w-11" />
            )}
          </div>
      </CardContent>
    </Card>
  );
}

export const CompanyCard = memo(CompanyCardComponent);
