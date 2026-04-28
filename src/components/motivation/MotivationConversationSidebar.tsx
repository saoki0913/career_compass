"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConversationSidebarCard } from "@/components/chat/ConversationWorkspaceShell";
import { MotivationEvidenceSection } from "@/components/motivation/MotivationEvidenceSection";
import { MotivationPhaseBar } from "@/components/motivation/MotivationPhaseBar";
import { MotivationProgressStatus } from "@/components/motivation/MotivationProgressStatus";
import { type CausalGap, type ConversationMode, type EvidenceCard, type StageStatus } from "@/lib/motivation/ui";

import { ResetIcon } from "./motivation-icons";

const SLOT_SIDEBAR_LABELS: Record<string, string> = {
  industry_reason: "業界への関心",
  company_reason: "企業を選ぶ理由",
  self_connection: "自分との接点",
  desired_work: "やりたい仕事",
  value_contribution: "貢献できること",
  differentiation: "自分ならではの強み",
};

const SLOT_DISPLAY_ORDER = [
  "industry_reason",
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
] as const;

export function MotivationConversationSidebar({
  companyId,
  effectiveIndustry,
  selectedRoleName,
  generatedDraft,
  generatedDocumentId,
  showSetupScreen,
  stageStatus,
  questionCount,
  conversationMode,
  coachingFocus,
  currentSlotLabel,
  currentIntentLabel,
  nextAdvanceCondition,
  isDraftReady,
  nextQuestion,
  causalGaps,
  evidenceCards,
  evidenceSummary,
  userEvidenceCards,
  slotSummaries,
  hasSavedConversation,
  isLocked,
  isSending,
  isGeneratingDraft,
  isResetting,
  isStartingConversation,
  onResetConversation,
  onOpenDraftModal,
}: {
  companyId: string;
  effectiveIndustry: string;
  selectedRoleName: string;
  generatedDraft: string | null;
  generatedDocumentId: string | null;
  showSetupScreen: boolean;
  stageStatus: StageStatus | null;
  questionCount: number;
  conversationMode: ConversationMode;
  coachingFocus: string | null;
  currentSlotLabel: string | null;
  currentIntentLabel: string | null;
  nextAdvanceCondition: string | null;
  isDraftReady: boolean;
  nextQuestion: string | null;
  causalGaps: CausalGap[];
  evidenceCards: EvidenceCard[];
  evidenceSummary: string | null;
  userEvidenceCards: EvidenceCard[];
  slotSummaries: Record<string, string>;
  hasSavedConversation: boolean;
  isLocked: boolean;
  isSending: boolean;
  isGeneratingDraft: boolean;
  isResetting: boolean;
  isStartingConversation: boolean;
  onResetConversation: () => void;
  onOpenDraftModal: () => void;
}) {
  return (
    <div className="space-y-4 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
      <div className="space-y-3 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        <ConversationSidebarCard
          title="進捗"
          actions={
            hasSavedConversation ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetConversation}
                disabled={isLocked || isSending || isGeneratingDraft || isResetting || isStartingConversation}
                className="h-9 rounded-xl border-border/80 bg-background px-3 text-xs shadow-sm"
              >
                <ResetIcon />
                <span className="ml-2">{isResetting ? "初期化中..." : "会話をやり直す"}</span>
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {effectiveIndustry ? (
                <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                  業界: {effectiveIndustry}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  業界未確定
                </Badge>
              )}
              {selectedRoleName ? (
                <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                  職種: {selectedRoleName}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1 text-[11px]">
                  職種未選択
                </Badge>
              )}
              {generatedDraft ? (
                <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                  ES下書き生成済み
                </Badge>
              ) : null}
            </div>

            {showSetupScreen ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-sm font-medium text-foreground">開始前の設定</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  業界と職種を確定すると、この企業向けに質問が始まります。
                </p>
              </div>
            ) : (
              <>
                <MotivationProgressStatus
                  stageStatus={stageStatus}
                  questionCount={questionCount}
                  conversationMode={conversationMode}
                  coachingFocus={coachingFocus}
                  currentSlotLabel={currentSlotLabel}
                  currentIntentLabel={currentIntentLabel}
                  nextAdvanceCondition={nextAdvanceCondition}
                  causalGaps={causalGaps}
                />
                <MotivationPhaseBar
                  isDraftReady={isDraftReady}
                  generatedDraft={generatedDraft}
                  conversationMode={conversationMode}
                  hasNextQuestion={Boolean(nextQuestion)}
                  hasCausalGaps={causalGaps.length > 0}
                />
              </>
            )}
          </div>
        </ConversationSidebarCard>

        <Card className="border-border/50">
          <CardHeader className="px-3.5 py-2.5">
            <CardTitle className="text-sm font-medium">参考にした企業情報</CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 pb-3.5 pt-0">
            {evidenceCards.length > 0 || evidenceSummary ? (
              <MotivationEvidenceSection
                evidenceCards={evidenceCards}
                evidenceSummary={evidenceSummary}
                compact
                showHeader={false}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                質問に使った企業情報の要点が、ここに簡潔に表示されます。
              </p>
            )}
          </CardContent>
        </Card>

        {userEvidenceCards.length > 0 || Object.keys(slotSummaries).length > 0 ? (
          <Card className="border-border/50">
            <CardHeader className="px-3.5 py-2.5">
              <CardTitle className="text-sm font-medium">参考にしたユーザー情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3.5 pb-3.5 pt-0">
              {userEvidenceCards.length > 0 ? (
                <MotivationEvidenceSection
                  evidenceCards={userEvidenceCards}
                  evidenceSummary={null}
                  compact
                  showHeader={false}
                />
              ) : (
                SLOT_DISPLAY_ORDER.filter((s) => slotSummaries[s]).map((slot) => (
                  <div key={slot}>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {SLOT_SIDEBAR_LABELS[slot] || "確認済みの情報"}
                    </p>
                    <p className="text-xs leading-5 text-foreground/80">
                      {slotSummaries[slot].length > 80
                        ? `${slotSummaries[slot].slice(0, 80)}...`
                        : slotSummaries[slot]}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {generatedDraft ? (
          <Card className="border-border/50">
            <CardHeader className="flex min-h-12 flex-row items-center justify-between space-y-0 px-3.5 py-2.5">
              <CardTitle className="text-sm font-medium">生成した下書き</CardTitle>
              <Badge variant="soft-info" className="px-2 py-0.5 text-[10px]">
                {generatedDraft.length}字
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 px-3.5 pb-3.5 pt-0">
              <p className="text-xs leading-5 text-muted-foreground line-clamp-4">
                {generatedDraft.slice(0, 120)}{generatedDraft.length > 120 ? "..." : ""}
              </p>
              {generatedDocumentId ? (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/es/${generatedDocumentId}`}>ESを編集する</Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onOpenDraftModal}
                >
                  下書きを確認する
                </Button>
              )}
              <Button asChild className="w-full">
                <Link href={`/companies/${companyId}/interview`}>この志望動機をもとに面接対策へ進む</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
