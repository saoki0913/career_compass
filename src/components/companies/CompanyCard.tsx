/**
 * CompanyCard Component
 *
 * Compact company card for 5-column grid layout
 */

"use client";

import { memo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Company } from "@/hooks/useCompanies";
import { getStatusConfig } from "@/lib/constants/status";
import {
  Calendar,
  Briefcase,
  FileText,
  ExternalLink,
  Star,
} from "lucide-react";

// Deadline type labels
const DEADLINE_TYPE_LABELS: Record<string, string> = {
  es_submission: "ES提出",
  web_test: "WEBテスト",
  aptitude_test: "適性検査",
  interview_1: "一次面接",
  interview_2: "二次面接",
  interview_3: "三次面接",
  interview_final: "最終面接",
  briefing: "説明会",
  internship: "インターン",
  offer_response: "内定返答",
  other: "その他",
};

interface CompanyCardProps {
  company: Company;
  onTogglePin?: (companyId: string, isPinned: boolean) => void;
}

function CompanyCardComponent({ company, onTogglePin }: CompanyCardProps) {
  const status = company.status || "inbox";
  const statusConfig = getStatusConfig(status);

  // Format deadline display (compact)
  const formatDeadline = () => {
    const deadline = company.nearestDeadline;
    if (!deadline) {
      return {
        content: <span className="text-muted-foreground text-sm">締切なし</span>,
        bgClass: "",
      };
    }

    const { daysLeft, type } = deadline;
    const typeLabel = DEADLINE_TYPE_LABELS[type] || type;

    // Urgency colors and backgrounds - using semantic design tokens
    const isUrgent = daysLeft <= 3;
    const isWarning = daysLeft > 3 && daysLeft <= 7;

    const urgencyClass =
      daysLeft < 0
        ? "text-destructive"
        : isUrgent
        ? "text-destructive"
        : isWarning
        ? "text-warning-foreground"
        : "text-muted-foreground";

    const bgClass =
      daysLeft < 0
        ? "bg-destructive/10"
        : isUrgent
        ? "bg-destructive/10"
        : isWarning
        ? "bg-warning/10"
        : "";

    // Days text
    const daysText =
      daysLeft < 0
        ? "期限切れ"
        : daysLeft === 0
        ? "今日"
        : daysLeft === 1
        ? "明日"
        : `${daysLeft}日`;

    return {
      content: (
        <div className={cn("flex items-center gap-1.5 text-sm", urgencyClass)}>
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{typeLabel}</span>
          <span className="font-semibold">{daysText}</span>
        </div>
      ),
      bgClass,
    };
  };

  const deadlineInfo = formatDeadline();

  return (
    <Link href={`/companies/${company.id}`}>
      <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer group">
        <CardContent className="p-4 flex flex-col h-full">
          {/* Header: Star + Name + Status */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {/* Pin toggle button - Endowment Effect: personalization creates attachment */}
              {onTogglePin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onTogglePin(company.id, !company.isPinned);
                  }}
                  className={cn(
                    "flex-shrink-0 p-1 -ml-1 rounded-md transition-all duration-200",
                    "hover:scale-110 active:scale-95",
                    "min-w-[28px] min-h-[28px] flex items-center justify-center", // Touch target 44px effective
                    company.isPinned
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-muted-foreground/50 hover:text-amber-400"
                  )}
                  title={company.isPinned ? "お気に入り解除" : "お気に入りに追加"}
                  aria-label={company.isPinned ? "お気に入り解除" : "お気に入りに追加"}
                >
                  <Star
                    className={cn(
                      "w-4 h-4 transition-all duration-200",
                      company.isPinned && "fill-current"
                    )}
                  />
                </button>
              )}
              <h3 className="font-semibold text-base text-foreground truncate group-hover:text-primary transition-colors">
                {company.name}
              </h3>
            </div>
            <Badge
              variant="outline"
              className={cn("text-xs px-2 py-0.5 h-6 flex-shrink-0 font-medium", statusConfig.bgColor, statusConfig.color)}
            >
              {statusConfig.label}
            </Badge>
          </div>

          {/* Industry */}
          <p className="text-sm text-muted-foreground mb-3 truncate">
            {company.industry || "業界未設定"}
          </p>

          {/* Deadline */}
          <div className={cn(
            "py-2 px-2 -mx-2 rounded-lg mb-3",
            deadlineInfo.bgClass || "bg-muted/30"
          )}>
            {deadlineInfo.content}
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-auto">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-4 h-4" />
                <span>{company.activeApplicationCount}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{company.esDocumentCount}</span>
              </span>
            </div>

            {/* External links - Selective Attention: recruitment link always visible */}
            <div className="flex items-center gap-1">
              {company.recruitmentUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (company.recruitmentUrl) {
                      window.open(company.recruitmentUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="採用ページを開く"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">採用</span>
                </button>
              )}
              {company.corporateUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (company.corporateUrl) {
                      window.open(company.corporateUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="p-1.5 hover:text-primary rounded-md hover:bg-muted/50 opacity-60 hover:opacity-100 transition-opacity"
                  title="企業HP"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export const CompanyCard = memo(CompanyCardComponent);
