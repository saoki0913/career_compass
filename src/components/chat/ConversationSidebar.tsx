"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ProgressStage, PhaseItem } from "@/components/chat";
import { ConversationProgressBar } from "./ConversationProgressBar";
import { ConversationPhaseBar } from "./ConversationPhaseBar";
import { ConversationSidebarCard } from "./ConversationWorkspaceShell";

interface ConversationSidebarProps {
  progressStages: ProgressStage[];
  progressHeaderSubtext: string;
  progressFooterMessage: string | null;
  progressColumns?: number;
  phases: PhaseItem[];
  helperText: string;
  badges?: ReactNode;
  progressChildren?: ReactNode;
  setupContent?: ReactNode;
  onReset?: () => void;
  resetLabel?: string;
  resetDisabled?: boolean;
  isResetting?: boolean;
  showReset?: boolean;
  children?: ReactNode;
}

export function ConversationSidebar({
  progressStages,
  progressHeaderSubtext,
  progressFooterMessage,
  progressColumns,
  phases,
  helperText,
  badges,
  progressChildren,
  setupContent,
  onReset,
  resetLabel = "会話をやり直す",
  resetDisabled = false,
  isResetting = false,
  showReset = false,
  children,
}: ConversationSidebarProps) {
  return (
    <>
      <ConversationSidebarCard
        title="進捗"
        actions={
          showReset ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-border/80 bg-background px-3 text-xs shadow-sm"
              onClick={onReset}
              disabled={resetDisabled || isResetting}
            >
              {isResetting ? `${resetLabel}...` : resetLabel}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {badges ? (
            <div className="flex flex-wrap items-center gap-2">{badges}</div>
          ) : null}

          {setupContent ? (
            setupContent
          ) : (
            <>
              <ConversationProgressBar
                stages={progressStages}
                headerSubtext={progressHeaderSubtext}
                footerMessage={progressFooterMessage}
                columns={progressColumns}
              >
                {progressChildren}
              </ConversationProgressBar>
              <ConversationPhaseBar phases={phases} />
            </>
          )}

          <p className="text-xs leading-5 text-muted-foreground">{helperText}</p>
        </div>
      </ConversationSidebarCard>
      {children}
    </>
  );
}
