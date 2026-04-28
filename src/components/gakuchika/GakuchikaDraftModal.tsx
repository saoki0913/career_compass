"use client";

import { memo } from "react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface GakuchikaDraftModalProps {
  isOpen: boolean;
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
  onSave: () => void;
  onDeepDive: () => void;
  onClose: () => void;
}

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

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

const DraftBody = memo(function DraftBody({
  draft,
  charLimit,
  draftQuality,
  mobile,
}: {
  draft: string;
  charLimit: number;
  draftQuality?: GakuchikaDraftModalProps["draftQuality"];
  mobile: boolean;
}) {
  const charCount = draft.length;
  const qualityWarnings = draftQuality?.warnings?.filter(Boolean) ?? [];
  const retryCount = draftQuality?.retry_count ?? draftQuality?.retryCount ?? 0;
  const shouldShowQualityNotice = draftQuality?.status === "warning" || draftQuality?.status === "repaired" || qualityWarnings.length > 0;

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
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {draft.trim() || "本文がありません。"}
        </p>
      </div>
    </div>
  );
});

const DraftFooter = memo(function DraftFooter({
  isSaving,
  onSave,
  onDeepDive,
  mobile,
}: {
  isSaving: boolean;
  onSave: () => void;
  onDeepDive: () => void;
  mobile: boolean;
}) {
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
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          ESを開く
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={onDeepDive}
          disabled={isSaving}
        >
          もっと深掘りして再生成する
        </Button>
      </div>
    </div>
  );
});

export const GakuchikaDraftModal = memo(function GakuchikaDraftModal({
  isOpen,
  draft,
  charLimit,
  draftQuality,
  isSaving,
  onSave,
  onDeepDive,
  onClose,
}: GakuchikaDraftModalProps) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  const title = "生成したガクチカES";
  const description = "内容を確認して開くか、深掘りして改善できます。";

  if (isMobile) {
    return (
      <Sheet
        open={isOpen}
        onOpenChange={(open) => { if (!open) onClose(); }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[85dvh] flex-col rounded-t-2xl border-0 p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            <SheetDescription className="mt-1 text-sm leading-snug">
              {description}
            </SheetDescription>
          </SheetHeader>
          <DraftBody draft={draft} charLimit={charLimit} draftQuality={draftQuality} mobile />
          <DraftFooter
            isSaving={isSaving}
            onSave={onSave}
            onDeepDive={onDeepDive}
            mobile
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <DialogContent className="flex max-h-[min(80vh,720px)] max-w-2xl flex-col overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-base leading-snug text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DraftBody draft={draft} charLimit={charLimit} draftQuality={draftQuality} mobile={false} />
        <DraftFooter
          isSaving={isSaving}
          onSave={onSave}
          onDeepDive={onDeepDive}
          mobile={false}
        />
      </DialogContent>
    </Dialog>
  );
});
