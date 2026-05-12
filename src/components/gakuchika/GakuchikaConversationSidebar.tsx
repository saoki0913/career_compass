"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ConversationSidebar,
  type ProgressStage,
} from "@/components/chat";
import { ConversationSidebarCard } from "@/components/chat/ConversationWorkspaceShell";
import { computePhaseItems } from "@/lib/shared/conversation-lifecycle";
import type { StandardPhaseKey } from "@/lib/shared/conversation-lifecycle";
import { getConversationBadgeLabel } from "@/lib/gakuchika/conversation-state";
import type { ConversationState } from "@/lib/gakuchika/conversation-state";
import type { Session } from "@/features/gakuchika/domain/ui";

const STAGE_TO_PHASE: Record<string, StandardPhaseKey> = {
  es_building: "questioning",
  draft_ready: "draft_ready",
  deep_dive_active: "deep_dive",
  interview_ready: "completed",
};

interface GakuchikaConversationSidebarProps {
  isAIPowered: boolean;
  currentSessionLabel: string | null;
  buildTrackStages: ProgressStage[];
  questionDisplay: string;
  primaryLine: string;
  helperText: string;
  conversationState: ConversationState | null;
  generatedDraft: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  gakuchikaTitle: string;
  gakuchikaContent: string | null;
  interviewReady: boolean;
  isGeneratingDraft: boolean;
  isSending: boolean;
  isResumingSession: boolean;
  isStarting: boolean;
  onRestartConversation: () => void;
  onSessionSelect: (sessionId: string) => void;
}

export function GakuchikaConversationSidebar({
  isAIPowered,
  currentSessionLabel,
  buildTrackStages,
  questionDisplay,
  primaryLine,
  helperText,
  conversationState,
  generatedDraft,
  sessions,
  currentSessionId,
  gakuchikaTitle,
  gakuchikaContent,
  interviewReady,
  isGeneratingDraft,
  isSending,
  isResumingSession,
  isStarting,
  onRestartConversation,
  onSessionSelect,
}: GakuchikaConversationSidebarProps) {
  const currentStage = conversationState?.stage ?? "es_building";
  const phaseKey = STAGE_TO_PHASE[currentStage] ?? "questioning";
  const hasDraft = generatedDraft;

  const gakuchikaPhases = useMemo(
    () => computePhaseItems(phaseKey, hasDraft),
    [phaseKey, hasDraft],
  );

  const resolvedHelperText =
    interviewReady && conversationState?.progressLabel
      ? `${conversationState.progressLabel}。`
      : helperText;

  return (
    <>
      <ConversationSidebar
        progressStages={buildTrackStages}
        progressHeaderSubtext={questionDisplay}
        progressFooterMessage={primaryLine}
        progressColumns={2}
        phases={gakuchikaPhases}
        helperText={resolvedHelperText}
        showReset
        onReset={onRestartConversation}
        resetDisabled={isStarting || isSending || isGeneratingDraft || isResumingSession}
        badges={
          <>
            <Badge variant={isAIPowered ? "soft-primary" : "outline"} className="px-3 py-1 text-[11px]">
              {isAIPowered ? "AI質問" : "基本質問"}
            </Badge>
            {currentSessionLabel ? (
              <Badge variant="outline" className="px-3 py-1 text-[11px]">
                セッション {currentSessionLabel}
              </Badge>
            ) : null}
          </>
        }
      >
        {sessions.length > 1 ? (
          <ConversationSidebarCard title="セッション履歴">
            <div className="space-y-2">
              {isGeneratingDraft ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  ES生成中はセッションを切り替えられません。
                </p>
              ) : null}
              {!isGeneratingDraft
                ? sessions.map((session, index) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        if (isSending || isResumingSession) return;
                        void onSessionSelect(session.id);
                      }}
                      disabled={isSending || isResumingSession}
                      className={cn(
                        "w-full rounded-xl border px-3 py-3 text-left text-xs transition-colors",
                        session.id === currentSessionId
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                        (isSending || isResumingSession) && "cursor-not-allowed opacity-60 hover:text-muted-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">#{sessions.length - index}</span>
                        <span>{getConversationBadgeLabel(session.status, session.conversationState)}</span>
                      </div>
                    </button>
                  ))
                : null}
            </div>
          </ConversationSidebarCard>
        ) : null}

        <ConversationSidebarCard title="作成メモ">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{gakuchikaTitle}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {gakuchikaContent || "テーマのみ登録されています。会話で内容を膨らませていきます。"}
            </p>
          </div>
        </ConversationSidebarCard>
      </ConversationSidebar>
    </>
  );
}
