"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ASSETS } from "@/lib/assets/image-registry";
import { getCompanyLogoSources, getCompanyAvatarColor, groupCompaniesByPipeline } from "@/lib/dashboard-utils";
import { getStatusConfig, type CompanyStatus } from "@/lib/constants/status";
import type { Company } from "@/hooks/useCompanies";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, Plus } from "lucide-react";

function CompanyFavicon({ urls, name }: { urls: ReturnType<typeof getCompanyLogoSources>; name: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const avatarColor = getCompanyAvatarColor(name);
  const sources = urls ? [urls.primary, ...urls.fallbacks] : [];
  const src = sources[sourceIndex];

  if (!src) {
    return (
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", avatarColor)}>
        {name.charAt(0)}
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white shadow-sm ring-1 ring-border/50 transition-all group-hover:ring-primary/30">
      <img src={src} alt="" width={24} height={24} className="h-5 w-5 rounded-sm object-contain" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onError={() => setSourceIndex((i) => i + 1)} />
    </span>
  );
}

const COLUMN_HEADER_COLORS: Record<string, string> = {
  slate: "bg-slate-500/90 text-white",
  blue: "bg-blue-500/90 text-white",
  purple: "bg-purple-500/90 text-white",
  amber: "bg-amber-500/90 text-white",
  green: "bg-emerald-500/90 text-white",
};

const COLUMN_COUNT_COLORS: Record<string, string> = {
  slate: "text-slate-600",
  blue: "text-blue-600",
  purple: "text-purple-600",
  amber: "text-amber-600",
  green: "text-emerald-600",
};

const COLUMN_EMPTY_ILLUSTRATIONS: Record<string, string> = {
  not_applied: DASHBOARD_ASSETS.emptyNotApplied,
  es_test: DASHBOARD_ASSETS.emptyEsTest,
  interview: DASHBOARD_ASSETS.emptyInterview,
  waiting: DASHBOARD_ASSETS.emptyWaiting,
  offer: DASHBOARD_ASSETS.emptyOffer,
};

interface CompanyProgressCardProps {
  companies: Company[];
}

export function CompanyProgressCard({ companies }: CompanyProgressCardProps) {
  const pipeline = useMemo(() => groupCompaniesByPipeline(companies), [companies]);

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 lg:px-5">
        <CardTitle className="text-lg">選考管理</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/companies">すべて見る</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
        {pipeline.totalActive === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 py-2 text-center">
            <Image
              src={DASHBOARD_ASSETS.emptyCompanies}
              alt=""
              width={640}
              height={640}
              className="h-24 w-24 object-contain"
            />
            <p className="mt-1 text-sm font-semibold">企業が未登録です</p>
            <p className="mt-0.5 text-xs text-muted-foreground">企業を追加して、選考を管理しましょう</p>
            <Button asChild className="mt-2" size="sm">
              <Link href="/companies/new">企業を追加</Link>
            </Button>
          </div>
        ) : (
          <div className="h-full overflow-x-auto lg:overflow-hidden">
            <div className="grid h-full min-w-[520px] grid-cols-5 gap-1.5 lg:min-w-0 lg:gap-2">
              {pipeline.columns.map((col) => {
                const count = col.companies.length;
                return (
                  <div key={col.key} className="flex min-h-0 flex-col">
                    <div
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2 py-1",
                        COLUMN_HEADER_COLORS[col.color] ?? COLUMN_HEADER_COLORS.slate,
                      )}
                    >
                      <span className="flex-1 text-xs font-semibold">{col.label}</span>
                      <span className={cn("rounded-full bg-white/90 px-1.5 text-[10px] font-bold", COLUMN_COUNT_COLORS[col.color])}>
                        {count}
                      </span>
                    </div>
                    <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-hidden">
                      {col.companies.slice(0, 3).map((company) => {
                        const faviconUrls = getCompanyLogoSources(
                          company.corporateUrl,
                          company.estimatedFaviconUrl,
                          company.name,
                          company.estimatedLogoDomains,
                          company.estimatedLogoCandidates,
                        );
                        const status = getStatusConfig(company.status as CompanyStatus);
                        return (
                          <Link
                            key={company.id}
                            href={`/companies/${company.id}`}
                            className="group flex min-h-[44px] items-center gap-2 rounded-lg border border-border/50 bg-card px-2 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
                          >
                            <CompanyFavicon urls={faviconUrls} name={company.name} />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 break-words text-sm font-medium leading-4 lg:text-xs" title={company.name}>
                                {company.name}
                              </p>
                              <span
                                className={cn(
                                  "text-[10px] font-medium rounded px-1 py-px lg:text-[9px]",
                                  status.color,
                                )}
                              >
                                {status.label}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                      {col.companies.length > 3 && (
                        <Link
                          href="/companies"
                          className="block text-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors lg:text-[10px]"
                        >
                          +{col.companies.length - 3}社
                        </Link>
                      )}
                      {col.companies.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center py-2 text-center">
                          <Image
                            src={COLUMN_EMPTY_ILLUSTRATIONS[col.key] ?? DASHBOARD_ASSETS.emptyCompanies}
                            alt=""
                            width={640}
                            height={640}
                            className="h-14 w-14 object-contain opacity-60"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      {pipeline.totalActive > 0 && (
        <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2 lg:px-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-primary">次の一歩</span>
            <span className="hidden sm:inline">企業詳細から締切や選考状況を更新できます</span>
            <span className="sm:hidden">企業詳細で更新</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/companies/new"
              className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
            >
              <span className="hidden sm:inline">企業を追加する</span>
              <span className="sm:hidden">追加</span>
              <Plus className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/calendar"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="カレンダーを開く"
            >
              <CalendarIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
