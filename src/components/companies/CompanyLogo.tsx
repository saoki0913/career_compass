"use client";

import { useState } from "react";

import { getCompanyAvatarColor, getCompanyLogoSources } from "@/lib/dashboard-utils";
import { cn } from "@/lib/utils";
import type { Company } from "@/hooks/useCompanies";

interface CompanyLogoProps {
  company: Company;
  className?: string;
  imageClassName?: string;
}

const failedLogoUrls = new Set<string>();

function findNextSourceIndex(sources: string[], startIndex: number): number {
  const safeStart = Math.max(0, startIndex);
  for (let index = safeStart; index < sources.length; index += 1) {
    if (!failedLogoUrls.has(sources[index])) {
      return index;
    }
  }
  return -1;
}

export function CompanyLogo({
  company,
  className,
  imageClassName,
}: CompanyLogoProps) {
  const [sourceState, setSourceState] = useState({ sourcesKey: "", sourceIndex: 0 });
  const avatarColor = getCompanyAvatarColor(company.name);
  const urls = getCompanyLogoSources(
    company.corporateUrl,
    company.estimatedFaviconUrl,
    company.name,
    company.estimatedLogoDomains,
    company.estimatedLogoCandidates
  );
  const sources = urls ? [urls.primary, ...urls.fallbacks] : [];
  const sourcesKey = sources.join("\n");
  const sourceIndex = sourceState.sourcesKey === sourcesKey ? sourceState.sourceIndex : 0;
  const resolvedSourceIndex = findNextSourceIndex(sources, sourceIndex);
  const src = resolvedSourceIndex >= 0 ? sources[resolvedSourceIndex] : undefined;

  if (!src) {
    return (
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold", avatarColor, className)}>
        {company.name.charAt(0)}
      </span>
    );
  }

  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border/60 transition-all group-hover:ring-primary/30", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- logo providers are dynamic fallback URLs outside next/image remote config */}
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        className={cn("h-6 w-6 rounded-sm object-contain", imageClassName)}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        onError={() => {
          failedLogoUrls.add(src);
          setSourceState({ sourcesKey, sourceIndex: resolvedSourceIndex + 1 });
        }}
      />
    </span>
  );
}
