"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function getSourceHostnameLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface ReferenceSourceCardProps {
  title: string;
  meta?: string | null;
  excerpt: ReactNode;
  sourceUrl?: string | null;
  linkLabel?: string;
  className?: string;
  compact?: boolean;
}

export function ReferenceSourceCard({
  title,
  meta,
  excerpt,
  sourceUrl,
  linkLabel = "元ページを開く",
  className,
  compact = false,
}: ReferenceSourceCardProps) {
  const isLinkVisible = Boolean(sourceUrl);
  const content = (
    <div
      className={cn(
        "group border border-border/70 bg-background shadow-sm transition-all duration-200",
        compact ? "rounded-[18px] p-3" : "rounded-[22px] p-4",
        isLinkVisible
          ? "hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
          : undefined,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className={cn("font-semibold text-foreground", compact ? "text-[13px] leading-5" : "text-sm")}>
            {title}
          </p>
          {meta ? (
            <p className={cn("text-muted-foreground", compact ? "text-[10px] leading-4" : "text-[11px] leading-5")}>
              {meta}
            </p>
          ) : null}
        </div>
        {isLinkVisible ? (
          <Badge
            variant="outline"
            className={cn("gap-1", compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]")}
          >
            <ExternalLink className="size-3.5" />
            {linkLabel}
          </Badge>
        ) : null}
      </div>
      <div className={cn("whitespace-pre-wrap", compact ? "mt-2" : "mt-3 min-h-10")}>{excerpt}</div>
    </div>
  );

  if (!isLinkVisible || !sourceUrl) {
    return content;
  }

  return (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
      {content}
    </a>
  );
}
