"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import type { ProgressStage } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConversationProgressBar } from "./ConversationProgressBar";

interface ConversationMobileStatusProps {
  badges?: ReactNode;
  stages: ProgressStage[];
  headerSubtext: string;
  footerMessage: string | null;
  columns?: number;
  actions?: ReactNode;
  detailsLabel?: string;
  detailsBadge?: ReactNode;
  children?: ReactNode;
}

export function ConversationMobileStatus({
  badges,
  stages,
  headerSubtext,
  footerMessage,
  columns,
  actions,
  detailsLabel = "詳細を見る",
  detailsBadge,
  children,
}: ConversationMobileStatusProps) {
  return (
    <div className="space-y-2">
      {badges ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{badges}</div>
      ) : null}
      <ConversationProgressBar
        stages={stages}
        headerSubtext={headerSubtext}
        footerMessage={footerMessage}
        variant="inline"
        columns={columns}
      />
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      {children ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 w-full justify-between rounded-xl px-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{detailsLabel}</span>
                {detailsBadge}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 grid gap-2 lg:grid-cols-2 xl:hidden">
            {children}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
