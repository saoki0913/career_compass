"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/EmptyState";
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
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white shadow-sm ring-1 ring-border/50">
      <img src={src} alt="" width={24} height={24} className="h-5 w-5 rounded-sm object-contain" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onError={() => setSourceIndex((i) => i + 1)} />
    </span>
  );
}

function DashboardAsset({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={1254}
      height={1254}
      className={cn("object-contain", className)}
    />
  );
}

const CompanyEmptyIcon = () => (
  <DashboardAsset src="/dashboard/assets/image_01.png" className="h-10 w-10" />
);

const EMPTY_COLUMN_ILLUSTRATIONS: Record<string, string> = {
  not_applied: "/dashboard/assets/image_01.png",
  es_test: "/dashboard/assets/image_03.png",
  interview: "/dashboard/assets/image_04.png",
  waiting: "/dashboard/assets/image_05.png",
  offer: "/dashboard/assets/image_07.png",
};

const COLUMN_HEADER_COLORS: Record<string, string> = {
  slate: "bg-slate-100/80 text-slate-700",
  blue: "bg-blue-100/80 text-blue-700",
  purple: "bg-purple-100/80 text-purple-700",
  amber: "bg-amber-100/80 text-amber-700",
  green: "bg-emerald-100/80 text-emerald-700",
};

interface CompanyProgressCardProps {
  companies: Company[];
}

export function CompanyProgressCard({ companies }: CompanyProgressCardProps) {
  const pipeline = useMemo(() => groupCompaniesByPipeline(companies), [companies]);

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 lg:px-5">
        <CardTitle className="text-lg">選考の企業管理</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/companies">すべて見る</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
        {pipeline.totalActive === 0 ? (
          <EmptyState
            icon={<CompanyEmptyIcon />}
            title="企業が未登録です"
            description="企業を追加して、選考を管理しましょう"
            action={{ label: "企業を追加", href: "/companies/new" }}
            className="py-2"
          />
        ) : (
          <div className="h-full overflow-x-auto lg:overflow-hidden">
            <div className="grid h-full min-w-[600px] grid-cols-5 gap-2 lg:min-w-0">
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
                      <span className="rounded-full bg-white/60 px-1.5 text-[10px] font-bold">
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
                        );
                        const status = getStatusConfig(company.status as CompanyStatus);
                        return (
                          <Link
                            key={company.id}
                            href={`/companies/${company.id}`}
                            className="group flex min-h-[42px] items-center gap-1.5 rounded-lg border border-border/40 bg-card px-1.5 py-1 transition-colors hover:border-primary/30 hover:bg-muted/30"
                          >
                            <CompanyFavicon urls={faviconUrls} name={company.name} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{company.name}</p>
                              <span
                                className={cn(
                                  "text-[9px] font-medium",
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
                          className="block text-center text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          +{col.companies.length - 3}社
                        </Link>
                      )}
                      {col.companies.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-3">
                          <DashboardAsset
                            src={EMPTY_COLUMN_ILLUSTRATIONS[col.key] ?? "/dashboard/assets/image_08.png"}
                            className="h-12 w-12 opacity-85"
                          />
                          <p className="mt-1 text-center text-[9px] text-muted-foreground/50">
                            ここに企業を追加
                          </p>
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
        <div className="flex items-center justify-between border-t border-border/30 px-4 py-2 lg:px-5">
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
