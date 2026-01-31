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
  Pin,
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
}

function CompanyCardComponent({ company }: CompanyCardProps) {
  const status = company.status || "inbox";
  const statusConfig = getStatusConfig(status);

  // Format deadline display (compact)
  const formatDeadline = () => {
    const deadline = company.nearestDeadline;
    if (!deadline) {
      return <span className="text-muted-foreground text-xs">締切なし</span>;
    }

    const { daysLeft, type } = deadline;
    const typeLabel = DEADLINE_TYPE_LABELS[type] || type;

    // Urgency colors - using semantic design tokens
    const urgencyClass =
      daysLeft < 0
        ? "text-destructive"
        : daysLeft <= 3
        ? "text-destructive"
        : daysLeft <= 7
        ? "text-warning-foreground"
        : "text-muted-foreground";

    // Days text
    const daysText =
      daysLeft < 0
        ? "期限切れ"
        : daysLeft === 0
        ? "今日"
        : daysLeft === 1
        ? "明日"
        : `${daysLeft}日`;

    return (
      <div className={cn("flex items-center gap-1 text-xs", urgencyClass)}>
        <Calendar className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{typeLabel}</span>
        <span className="font-medium">{daysText}</span>
      </div>
    );
  };

  return (
    <Link href={`/companies/${company.id}`}>
      <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer group">
        <CardContent className="p-3 flex flex-col h-full">
          {/* Header: Name + Status */}
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {company.isPinned && (
                <Pin className="w-3 h-3 text-primary flex-shrink-0" />
              )}
              <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                {company.name}
              </h3>
            </div>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-5 flex-shrink-0", statusConfig.bgColor, statusConfig.color)}
            >
              {statusConfig.label}
            </Badge>
          </div>

          {/* Industry */}
          <p className="text-xs text-muted-foreground mb-2 truncate">
            {company.industry || "業界未設定"}
          </p>

          {/* Deadline */}
          <div className="py-1.5 border-y border-border/50 mb-2">
            {formatDeadline()}
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                <span>{company.activeApplicationCount}</span>
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>{company.esDocumentCount}</span>
              </span>
            </div>

            {/* External links (compact) */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {company.recruitmentUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    window.open(company.recruitmentUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="p-1 hover:text-primary"
                  title="採用ページ"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              {company.corporateUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    window.open(company.corporateUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="p-1 hover:text-primary"
                  title="企業HP"
                >
                  <ExternalLink className="w-3 h-3" />
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
