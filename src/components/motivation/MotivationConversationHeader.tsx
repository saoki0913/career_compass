"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MotivationDraftActionBar } from "@/components/motivation/MotivationDraftActionBar";

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

export function MotivationConversationHeader({
  companyId,
  companyName,
  charLimit,
  onCharLimitChange,
  onGenerateDraft,
  isGeneratingDraft,
  canGenerateDraft,
  isLocked,
  draftHelperText,
  showSetupScreen,
  isPostDraftMode,
  motivationModeLabel,
}: {
  companyId: string;
  companyName: string;
  charLimit: 300 | 400 | 500;
  onCharLimitChange: (limit: 300 | 400 | 500) => void;
  onGenerateDraft: () => void;
  isGeneratingDraft: boolean;
  canGenerateDraft: boolean;
  isLocked: boolean;
  draftHelperText: string;
  showSetupScreen: boolean;
  isPostDraftMode: boolean;
  motivationModeLabel: string;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="flex items-center gap-3">
        <Link
          href={`/companies/${companyId}`}
          className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="戻る"
        >
          <ArrowLeftIcon />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-bold">志望動機を作成</h1>
            <div className="hidden h-1.5 w-1.5 rounded-full bg-muted-foreground/30 lg:block" />
            <p className="text-sm text-muted-foreground">{companyName}</p>
            {!showSetupScreen ? (
              <Badge variant={isPostDraftMode ? "soft-info" : "outline"} className="px-3 py-1 text-[11px]">
                {motivationModeLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <div className="w-full xl:max-w-[760px]">
        <MotivationDraftActionBar
          charLimit={charLimit}
          onCharLimitChange={onCharLimitChange}
          onGenerate={onGenerateDraft}
          isGenerating={isGeneratingDraft}
          disabled={!canGenerateDraft || isLocked}
          helperText={draftHelperText}
          layout="inline"
          showTitle={false}
        />
      </div>
    </div>
  );
}
