"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
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
import {
  computeJapaneseDiff,
  countChanges,
  type DiffSegment,
} from "@/lib/es-review/text-diff";

interface ReflectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUndo?: () => void;
  originalText: string;
  newText: string;
  isFullDocument?: boolean;
}

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

// ---------------------------------------------------------------------------
// DiffHighlightView -- renders DiffSegment[] with color-coded highlights
// ---------------------------------------------------------------------------

const DiffHighlightView = memo(function DiffHighlightView({
  segments,
  filter,
}: {
  segments: DiffSegment[];
  /** Which segment types to render. Omit to render all. */
  filter?: ("same" | "added" | "removed")[];
}) {
  const visible = filter
    ? segments.filter((s) => filter.includes(s.type))
    : segments;

  if (visible.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
        本文がありません。
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-base leading-relaxed">
      {visible.map((seg, i) => {
        switch (seg.type) {
          case "added":
            return (
              <span
                key={i}
                className="rounded-sm bg-emerald-100 text-foreground dark:bg-emerald-900/30"
              >
                {seg.text}
              </span>
            );
          case "removed":
            return (
              <span
                key={i}
                className="rounded-sm bg-red-100 text-foreground line-through dark:bg-red-900/30"
              >
                {seg.text}
              </span>
            );
          default:
            return (
              <span key={i} className="text-foreground">
                {seg.text}
              </span>
            );
        }
      })}
    </p>
  );
});

// ---------------------------------------------------------------------------
// DiffBadge -- character count delta
// ---------------------------------------------------------------------------

const DiffBadge = memo(function DiffBadge({
  originalText,
  newText,
}: {
  originalText: string;
  newText: string;
}) {
  const originalLength = originalText.trim().length;
  const newLength = newText.trim().length;
  const diff = newLength - originalLength;
  const label =
    diff === 0 ? "文字数同程度" : diff > 0 ? `+${diff}字` : `${diff}字`;

  return (
    <Badge variant="soft-info" className="shrink-0 px-3 py-1 text-xs">
      {label}
    </Badge>
  );
});

// ---------------------------------------------------------------------------
// ChangeCountBadge -- number of changed segments
// ---------------------------------------------------------------------------

const ChangeCountBadge = memo(function ChangeCountBadge({
  count,
}: {
  count: number;
}) {
  if (count === 0) return null;
  return (
    <Badge variant="soft-success" className="shrink-0 px-3 py-1 text-xs">
      {count}箇所変更
    </Badge>
  );
});

// ---------------------------------------------------------------------------
// DisplayModeToggle -- switches between diff view and plain view
// ---------------------------------------------------------------------------

const DisplayModeToggle = memo(function DisplayModeToggle({
  showDiff,
  onToggle,
}: {
  showDiff: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div
      className="flex shrink-0 gap-1 rounded-full border border-border/60 bg-muted/30 p-0.5"
      role="radiogroup"
      aria-label="表示モード"
    >
      <button
        type="button"
        role="radio"
        aria-checked={showDiff}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          showDiff
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onToggle(true)}
      >
        変更点を表示
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!showDiff}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          !showDiff
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onToggle(false)}
      >
        プレーン表示
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ComparisonPanel -- single panel (before or after) with optional diff
// ---------------------------------------------------------------------------

const ComparisonPanel = memo(function ComparisonPanel({
  label,
  description,
  tone,
  text,
  diffSegments,
  showDiff,
  sheetMode = false,
  className,
}: {
  label: string;
  description: string;
  tone: "before" | "after";
  text: string;
  diffSegments?: DiffSegment[];
  showDiff?: boolean;
  sheetMode?: boolean;
  className?: string;
}) {
  const toneClasses =
    tone === "before"
      ? "border-border/60 bg-muted/30"
      : "border-primary/25 bg-primary/5";

  // Determine which segment types to show in each panel
  const filter: ("same" | "added" | "removed")[] | undefined =
    showDiff && diffSegments
      ? tone === "before"
        ? ["same", "removed"]
        : ["same", "added"]
      : undefined;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border p-5",
        toneClasses,
        sheetMode && "min-h-0 flex-1",
        !sheetMode && "h-full",
        className,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge
          variant={tone === "before" ? "outline" : "soft-primary"}
          className="shrink-0 px-3 py-1 text-xs"
        >
          {text.trim().length}字
        </Badge>
      </div>
      <div
        className={cn(
          "mt-4 min-h-0 overflow-y-auto rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm",
          sheetMode ? "max-h-[min(58vh,520px)] flex-1" : "flex-1",
        )}
      >
        {showDiff && diffSegments ? (
          <DiffHighlightView segments={diffSegments} filter={filter} />
        ) : (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {text.trim() || "本文がありません。"}
          </p>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// FooterChangeSummary -- brief text summary of changes
// ---------------------------------------------------------------------------

const FooterChangeSummary = memo(function FooterChangeSummary({
  changeCount,
}: {
  changeCount: number;
}) {
  if (changeCount === 0) return null;

  const label =
    changeCount === 1
      ? "1箇所の変更が含まれています"
      : `${changeCount}箇所の変更が含まれています`;

  return (
    <p className="text-xs text-muted-foreground">
      {label}
    </p>
  );
});

// ---------------------------------------------------------------------------
// ReflectContentDesktop -- side-by-side comparison with diff highlights
// ---------------------------------------------------------------------------

const ReflectContentDesktop = memo(function ReflectContentDesktop({
  originalText,
  newText,
  isFullDocument,
  diffSegments,
  showDiff,
}: {
  originalText: string;
  newText: string;
  isFullDocument: boolean;
  diffSegments: DiffSegment[];
  showDiff: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-5">
      {isFullDocument ? (
        <div className="shrink-0 rounded-xl border border-info/25 bg-info/10 p-4">
          <p className="text-base leading-relaxed text-foreground/90">
            全文モードではクリップボードにコピーします。設問単位の添削では、この改善案をエディタへ直接反映できます。
          </p>
        </div>
      ) : null}

      <div className="grid min-h-0 gap-5 md:min-h-[min(48vh,440px)] md:grid-cols-2 md:items-stretch">
        <ComparisonPanel
          label="変更前"
          description="今の回答です。"
          tone="before"
          text={originalText}
          diffSegments={diffSegments}
          showDiff={showDiff}
        />
        <ComparisonPanel
          label="変更後"
          description="反映される改善案です。"
          tone="after"
          text={newText}
          diffSegments={diffSegments}
          showDiff={showDiff}
        />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ReflectSheetCompare -- mobile inline diff view (replaces tab-based UI)
// ---------------------------------------------------------------------------

const ReflectSheetCompare = memo(function ReflectSheetCompare({
  newText,
  isFullDocument,
  diffSegments,
  showDiff,
}: {
  newText: string;
  isFullDocument: boolean;
  diffSegments: DiffSegment[];
  showDiff: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {isFullDocument ? (
        <div className="shrink-0 rounded-xl border border-info/25 bg-info/10 p-4">
          <p className="text-sm leading-relaxed text-foreground/90">
            全文モードではクリップボードにコピーします。設問単位の添削では、この改善案をエディタへ直接反映できます。
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">
              {showDiff ? "変更箇所" : "改善後"}
            </p>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {showDiff
                ? "追加は緑、削除は赤の取り消し線で表示しています。"
                : "改善後の全文です。"}
            </p>
          </div>
          <Badge
            variant="soft-primary"
            className="shrink-0 px-3 py-1 text-xs"
          >
            {newText.trim().length}字
          </Badge>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-xl border border-border/50 bg-card px-4 py-4 shadow-sm">
          {showDiff ? (
            <DiffHighlightView segments={diffSegments} />
          ) : (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {newText.trim() || "本文がありません。"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// UndoToast
// ---------------------------------------------------------------------------

const UndoToast = memo(function UndoToast({
  undoTimer,
  onUndo,
}: {
  undoTimer: number;
  onUndo: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex max-w-md items-center gap-3 rounded-2xl border border-border/60 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/12 text-success">
          <Check className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            改善案を反映しました
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {undoTimer}秒以内なら元に戻せます。
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={onUndo}
        >
          <RotateCcw className="size-4" />
          元に戻す
        </Button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ReflectModal -- main export
// ---------------------------------------------------------------------------

export function ReflectModal({
  isOpen,
  onClose,
  onConfirm,
  onUndo,
  originalText,
  newText,
  isFullDocument = false,
}: ReflectModalProps) {
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimer, setUndoTimer] = useState(10);
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  // Compute diff segments once and pass down
  const diffSegments = useMemo(
    () => computeJapaneseDiff(originalText, newText),
    [originalText, newText],
  );
  const changeCount = useMemo(
    () => countChanges(diffSegments),
    [diffSegments],
  );

  useEffect(() => {
    if (!showUndo) {
      return;
    }

    const interval = window.setInterval(() => {
      setUndoTimer((prev) => {
        if (prev <= 1) {
          setShowUndo(false);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [showUndo]);

  const title = useMemo(
    () =>
      isFullDocument
        ? "改善案をコピーしますか？"
        : "この改善案を反映しますか？",
    [isFullDocument],
  );

  const description = useMemo(
    () =>
      isFullDocument
        ? "変更後の本文だけをコピーします。"
        : "変更前と変更後を見比べてから反映できます。",
    [isFullDocument],
  );

  const handleConfirm = useCallback(() => {
    onConfirm();
    setShowUndo(true);
    setUndoTimer(10);
  }, [onConfirm]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to copy rewrite text:", err);
    }
  }, [newText]);

  const handleUndo = useCallback(() => {
    onUndo?.();
    setShowUndo(false);
    setUndoTimer(10);
  }, [onUndo]);

  if (!isOpen && !showUndo) {
    return null;
  }

  const footer = (
    <div className="shrink-0 border-t border-border/60 bg-muted/20 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3">
        {changeCount > 0 ? (
          <FooterChangeSummary changeCount={changeCount} />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
          {isFullDocument ? (
            <Button
              className="rounded-full sm:min-w-[11rem]"
              onClick={handleCopyToClipboard}
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {copied ? "コピー済み" : "改善案をコピー"}
            </Button>
          ) : (
            <Button
              className="rounded-full sm:min-w-[11rem]"
              onClick={handleConfirm}
            >
              <Sparkles className="size-4" />
              この改善案を反映
            </Button>
          )}
          <Button variant="outline" className="rounded-full" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );

  // Header badges and toggle -- shared between mobile and desktop
  const headerBadges = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <DiffBadge originalText={originalText} newText={newText} />
      <ChangeCountBadge count={changeCount} />
    </div>
  );

  return (
    <>
      {showUndo ? (
        <UndoToast undoTimer={undoTimer} onUndo={handleUndo} />
      ) : null}

      {isOpen ? (
        isMobile ? (
          <Sheet
            open={isOpen}
            onOpenChange={(open) => (!open ? onClose() : undefined)}
          >
            <SheetContent
              side="bottom"
              className="flex h-[90dvh] max-h-[90vh] flex-col rounded-t-2xl border-0 p-0"
            >
              <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <SheetTitle className="text-lg">{title}</SheetTitle>
                      <SheetDescription className="mt-1 text-sm leading-snug">
                        {description}
                      </SheetDescription>
                    </div>
                    {headerBadges}
                  </div>
                  <DisplayModeToggle
                    showDiff={showDiff}
                    onToggle={setShowDiff}
                  />
                </div>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
                <ReflectSheetCompare
                  newText={newText}
                  isFullDocument={isFullDocument}
                  diffSegments={diffSegments}
                  showDiff={showDiff}
                />
              </div>
              {footer}
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog
            open={isOpen}
            onOpenChange={(open) => (!open ? onClose() : undefined)}
          >
            <DialogContent className="flex max-h-[min(92vh,920px)] max-w-6xl flex-col overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg">
              <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <DialogTitle className="text-xl">{title}</DialogTitle>
                      <DialogDescription className="mt-2 text-base leading-snug text-muted-foreground">
                        {description}
                      </DialogDescription>
                    </div>
                    {headerBadges}
                  </div>
                  <DisplayModeToggle
                    showDiff={showDiff}
                    onToggle={setShowDiff}
                  />
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <ReflectContentDesktop
                  originalText={originalText}
                  newText={newText}
                  isFullDocument={isFullDocument}
                  diffSegments={diffSegments}
                  showDiff={showDiff}
                />
              </div>
              {footer}
            </DialogContent>
          </Dialog>
        )
      ) : null}
    </>
  );
}
