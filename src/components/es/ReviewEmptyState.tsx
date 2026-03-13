"use client";

import type { ReactNode } from "react";
import { Link2, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ReviewEmptyStateProps {
  companyReviewStatus?:
    | "no_company_selected"
    | "company_selected_not_fetched"
    | "company_status_checking"
    | "company_fetched_but_not_ready"
    | "ready_for_es_review";
  companyName?: string;
  companyId?: string;
  className?: string;
}

function CapabilityCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function ReviewEmptyState({
  companyReviewStatus = "no_company_selected",
  companyName,
  className,
}: ReviewEmptyStateProps) {
  const hasSelectedCompany = companyReviewStatus !== "no_company_selected";
  const title = hasSelectedCompany && companyName
    ? `設問を選択すると、ここで${companyName}に合わせたAI添削ができます`
    : hasSelectedCompany
      ? "設問を選択すると、ここで企業情報に合わせたAI添削ができます"
      : "設問を選択すると、ここでAI添削ができます";

  const description = "この設問に対する改善案、改善ポイント、出典リンクをこの順で見やすく表示します。";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[28px] border border-border/70 bg-background p-5 shadow-sm",
        className,
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="soft-primary" className="gap-1.5 px-3 py-1 text-[11px]">
              <Sparkles className="size-3.5" />
              AI添削
            </Badge>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 max-w-[460px] text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <CapabilityCard
            icon={<Target className="size-4" />}
            title="改善した回答を提案"
            description="改善した回答を表示します。"
          />
          <CapabilityCard
            icon={<Sparkles className="size-4" />}
            title="改善ポイントを整理"
            description="修正すべき点を順に整理して表示します。"
          />
          <CapabilityCard
            icon={<Link2 className="size-4" />}
            title="情報取得元を確認"
            description="企業情報を使用したときは参照元も表示します。"
          />
        </div>
      </div>
    </div>
  );
}
