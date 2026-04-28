"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { getCompanyLogoSources, getCompanyAvatarColor, groupCompaniesByPipeline } from "@/lib/dashboard-utils";
import { getStatusConfig, type CompanyStatus } from "@/lib/constants/status";
import type { Company } from "@/hooks/useCompanies";
import { cn } from "@/lib/utils";

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

const CompanyEmptyIcon = () => (
  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

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
              {pipeline.columns.map((col) => (
                <div key={col.key} className="flex min-h-0 flex-col">
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1",
                      COLUMN_HEADER_COLORS[col.color] ?? COLUMN_HEADER_COLORS.slate,
                    )}
                  >
                    <span className="text-xs font-semibold">{col.label}</span>
                    <span className="rounded-full bg-white/60 px-1.5 text-[10px] font-bold">
                      {col.companies.length}
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
                      <p className="py-2 text-center text-[10px] text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
