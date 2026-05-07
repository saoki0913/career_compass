"use client";

import { memo } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftPreviewModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  draft: string;
  charLimit: 300 | 400 | 500;
  draftQuality?: {
    status?: "passed" | "repaired" | "warning";
    warnings?: string[];
    retry_count?: number;
    retryCount?: number;
    failure_codes?: string[];
    selection_reason?: string;
    selectionReason?: string;
  } | null;
  isSaving: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onDeepDive: () => void;
  onClose: () => void;
  deepDiveConfirm?: {
    title: string;
    description: string;
    confirmLabel: string;
  } | null;
  preBodyNotice?: ReactNode;
}

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

// ---------------------------------------------------------------------------
// CharCountBadge
// ---------------------------------------------------------------------------

const CharCountBadge = memo(function CharCountBadge({
  actual,
  limit,
}: {
  actual: number;
  limit: number;
}) {
  return (
    <Badge variant="soft-info" className="shrink-0 px-3 py-1 text-xs">
      {actual}字 / {limit}字
    </Badge>
  );
});

// ---------------------------------------------------------------------------
// DraftBody -- scrollable draft text with character count
// ---------------------------------------------------------------------------

const DraftBody = memo(function DraftBody({
  draft,
  charLimit,
  draftQuality,
  preBodyNotice,
  mobile,
}: {
  draft: string;
  charLimit: number;
  draftQuality?: DraftPreviewModalProps["draftQuality"];
  preBodyNotice?: ReactNode;
  mobile: boolean;
}) {
  const charCount = draft.length;
  const qualityWarnings = draftQuality?.warnings?.filter(Boolean) ?? [];
  const retryCount =
    draftQuality?.retry_count ?? draftQuality?.retryCount ?? 0;
  const shouldShowQualityNotice =
    draftQuality?.status === "warning" ||
    draftQuality?.status === "repaired" ||
    qualityWarnings.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        mobile ? "px-4 py-4" : "px-6 py-5",
      )}
    >
      <div className="mb-3 flex items-center justify-end">
        <CharCountBadge actual={charCount} limit={charLimit} />
      </div>
      {shouldShowQualityNotice ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <p className="font-medium">
            {draftQuality?.status === "repaired"
              ? "品質チェックで一度整え直しました。"
              : "提出前に本文の自然さを確認してください。"}
          </p>
          {qualityWarnings.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {qualityWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          ) : retryCount > 0 ? (
            <p className="mt-1">文字数や結びの表現を再確認しています。</p>
          ) : null}
        </div>
      ) : null}
      {preBodyNotice}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {draft.trim() || "本文がありません。"}
        </p>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// DraftFooter -- action buttons
// ---------------------------------------------------------------------------

const DraftFooter = memo(function DraftFooter({
  isSaving,
  primaryLabel,
  onPrimary,
  onDeepDive,
  deepDiveConfirm,
  mobile,
}: {
  isSaving: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onDeepDive: () => void;
  deepDiveConfirm?: DraftPreviewModalProps["deepDiveConfirm"];
  mobile: boolean;
}) {
  const deepDiveButton = deepDiveConfirm ? (
    <Button
      variant="outline"
      className="rounded-full"
      disabled={isSaving}
      asChild
    >
      <AlertDialogTrigger>もっと深掘りして再生成する</AlertDialogTrigger>
    </Button>
  ) : (
    <Button
      variant="outline"
      className="rounded-full"
      onClick={() => {
        void onDeepDive();
      }}
      disabled={isSaving}
    >
      もっと深堀りして再生成する
    </Button>
  );

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border/60",
        mobile ? "px-4 py-4" : "px-6 py-4",
      )}
    >
      <div
        className={cn(
          "flex gap-3",
          mobile ? "flex-col gap-2" : "flex-row justify-end",
        )}
      >
        <Button
          className={cn("rounded-full", !mobile && "min-w-[11rem]")}
          onClick={onPrimary}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {primaryLabel}
        </Button>
        {deepDiveButton}
      </div>
      {deepDiveConfirm ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deepDiveConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deepDiveConfirm.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={onDeepDive}>
              {deepDiveConfirm.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// DraftPreviewModal -- main export
// ---------------------------------------------------------------------------

export type { DraftPreviewModalProps };

export const DraftPreviewModal = memo(function DraftPreviewModal({
  isOpen,
  title,
  description,
  draft,
  charLimit,
  draftQuality,
  isSaving,
  primaryLabel,
  onPrimary,
  onDeepDive,
  onClose,
  deepDiveConfirm,
  preBodyNotice,
}: DraftPreviewModalProps) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  const body = (
    <DraftBody
      draft={draft}
      charLimit={charLimit}
      draftQuality={draftQuality}
      preBodyNotice={preBodyNotice}
      mobile={isMobile}
    />
  );

  const footer = (
    <DraftFooter
      isSaving={isSaving}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      onDeepDive={onDeepDive}
      deepDiveConfirm={deepDiveConfirm}
      mobile={isMobile}
    />
  );

  const wrappedFooter = deepDiveConfirm ? (
    <AlertDialog>{footer}</AlertDialog>
  ) : (
    footer
  );

  if (isMobile) {
    return (
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[92dvh] flex-col rounded-t-2xl border-0 p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            <SheetDescription className="mt-1 text-sm leading-snug">
              {description}
            </SheetDescription>
          </SheetHeader>
          {body}
          {wrappedFooter}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(92vh,920px)] max-w-6xl flex-col overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-base leading-snug text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        {body}
        {wrappedFooter}
      </DialogContent>
    </Dialog>
  );
});
