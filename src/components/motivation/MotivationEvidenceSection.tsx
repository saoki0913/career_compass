"use client";

import { ReferenceSourceCard } from "@/components/shared/ReferenceSourceCard";
import { cn } from "@/lib/utils";
import type { EvidenceCard } from "@/lib/motivation/ui";

function MotivationEvidenceCards({
  evidenceCards,
  compact = false,
}: {
  evidenceCards: EvidenceCard[];
  compact?: boolean;
}) {
  if (evidenceCards.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {evidenceCards.slice(0, compact ? 2 : 3).map((card) => (
        <ReferenceSourceCard
          key={`${card.sourceId}-${card.sourceUrl}`}
          title={card.title}
          meta={card.relevanceLabel}
          sourceUrl={card.sourceUrl}
          compact={compact}
          excerpt={
            <p
              className={cn(
                "text-muted-foreground",
                compact
                  ? "text-[11px] leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] overflow-hidden"
                  : "text-sm leading-6 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] overflow-hidden",
              )}
            >
              {card.excerpt}
            </p>
          }
        />
      ))}
    </div>
  );
}

export function MotivationEvidenceSection({
  evidenceCards,
  evidenceSummary,
  compact = false,
  showHeader = true,
}: {
  evidenceCards: EvidenceCard[];
  evidenceSummary: string | null;
  compact?: boolean;
  showHeader?: boolean;
}) {
  if (evidenceCards.length === 0 && !evidenceSummary) return null;

  return (
    <div className={cn("space-y-3", compact ? "rounded-xl border border-border/60 bg-muted/30 px-3 py-3" : undefined)}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn("font-semibold text-foreground", compact ? "text-[11px]" : "text-sm")}>
            参考にした企業情報
          </p>
        </div>
      ) : null}

      {evidenceCards.length > 0 ? (
        <MotivationEvidenceCards evidenceCards={evidenceCards} compact={compact} />
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{evidenceSummary}</p>
      )}
    </div>
  );
}
