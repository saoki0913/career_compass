"use client";

import type { ReactNode } from "react";

import type { ProgressStage } from "@/components/chat";
import { ConversationProgressBar } from "./ConversationProgressBar";

interface ConversationMobileStatusProps {
  badges?: ReactNode;
  stages: ProgressStage[];
  headerSubtext: string;
  footerMessage: string | null;
  columns?: number;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ConversationMobileStatus({
  badges,
  stages,
  headerSubtext,
  footerMessage,
  columns,
  actions,
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
      {children ? <div className="grid gap-2 lg:grid-cols-2 xl:hidden">{children}</div> : null}
    </div>
  );
}
