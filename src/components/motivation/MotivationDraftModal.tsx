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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MotivationDraftModalProps {
  isOpen: boolean;
  draft: string;
  charLimit: 300 | 400 | 500;
  isSaving: boolean;
  onSave: () => void;
  onDeepDive: () => void;
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
  mobile,
}: {
  draft: string;
  charLimit: number;
  mobile: boolean;
}) {
  const charCount = draft.length;

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
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {draft.trim() || "本文がありません。"}
        </p>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Footer -- action buttons
// ---------------------------------------------------------------------------

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
          ESとして保存する
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={onDeepDive}
          disabled={isSaving}
        >
          もっと深堀りして再生成する
        </Button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// MotivationDraftModal -- main export
// ---------------------------------------------------------------------------

export const MotivationDraftModal = memo(function MotivationDraftModal({
  isOpen,
  draft,
  charLimit,
  isSaving,
  onSave,
  onDeepDive,
}: MotivationDraftModalProps) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  const title = "生成した志望動機ES";
  const description = "内容を確認して保存するか、深掘りして改善できます。";

  if (isMobile) {
    return (
      <Sheet
        open={isOpen}
        onOpenChange={(open) => { if (!open) onDeepDive(); }}
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
          <DraftBody draft={draft} charLimit={charLimit} mobile />
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
      onOpenChange={(open) => { if (!open) onDeepDive(); }}
    >
      <DialogContent className="flex max-h-[min(80vh,720px)] max-w-2xl flex-col overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-base leading-snug text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DraftBody draft={draft} charLimit={charLimit} mobile={false} />
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
