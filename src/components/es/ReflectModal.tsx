"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface ReflectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUndo?: () => void;
  originalText: string;
  newText: string;
  isFullDocument?: boolean;
}

/** ES エディタ・MobileReviewPanel と同じ 1024px 未満をモバイル扱いに揃える */
const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

function DiffBadge({ originalText, newText }: { originalText: string; newText: string }) {
  const originalLength = originalText.trim().length;
  const newLength = newText.trim().length;
  const diff = newLength - originalLength;
  const label = diff === 0 ? "文字数同程度" : diff > 0 ? `+${diff}字` : `${diff}字`;

  return (
    <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
      {label}
    </Badge>
  );
}

function ComparisonPanel({
  label,
  description,
  tone,
  text,
}: {
  label: string;
  description: string;
  tone: "before" | "after";
  text: string;
}) {
  const toneClasses =
    tone === "before"
      ? "border-border/60 bg-muted/25"
      : "border-primary/20 bg-primary/6";

  return (
    <div className={`rounded-[24px] border p-4 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Badge variant={tone === "before" ? "outline" : "soft-primary"} className="px-3 py-1 text-[11px]">
          {text.trim().length}字
        </Badge>
      </div>
      <div className="mt-4 max-h-[260px] overflow-y-auto rounded-[20px] border border-border/50 bg-background/90 px-4 py-3">
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
          {text.trim() || "本文がありません。"}
        </p>
      </div>
    </div>
  );
}

function ReflectContent({
  originalText,
  newText,
  isFullDocument,
}: {
  originalText: string;
  newText: string;
  isFullDocument: boolean;
}) {
  return (
    <div className="space-y-4">
      {isFullDocument ? (
        <div className="rounded-[20px] border border-info/20 bg-info/8 p-4">
          <p className="text-sm leading-6 text-foreground/85">
            全文モードではクリップボードにコピーします。設問単位の添削では、この改善案をエディタへ直接反映できます。
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <ComparisonPanel
          label="変更前"
          description="今の回答です。"
          tone="before"
          text={originalText}
        />
        <ComparisonPanel
          label="変更後"
          description="反映される改善案です。"
          tone="after"
          text={newText}
        />
      </div>
    </div>
  );
}

function UndoToast({
  undoTimer,
  onUndo,
}: {
  undoTimer: number;
  onUndo: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex max-w-md items-center gap-3 rounded-[24px] border border-border/60 bg-background/95 px-4 py-3 shadow-[0_18px_52px_rgba(15,23,42,0.14)] backdrop-blur-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/12 text-success">
          <Check className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">改善案を反映しました</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {undoTimer}秒以内なら元に戻せます。
          </p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onUndo}>
          <RotateCcw className="size-4" />
          元に戻す
        </Button>
      </div>
    </div>
  );
}

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
  const isMobile = useIsMobileViewport();

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
    () => (isFullDocument ? "改善案をコピーしますか？" : "この改善案を反映しますか？"),
    [isFullDocument],
  );

  const description = useMemo(
    () =>
      isFullDocument
        ? "変更後の本文だけをコピーします。"
        : "変更前と変更後を見比べてから反映できます。",
    [isFullDocument],
  );

  const handleConfirm = () => {
    onConfirm();
    setShowUndo(true);
    setUndoTimer(10);
  };

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Failed to copy rewrite text:", err);
    }
  }, [newText]);

  const handleUndo = () => {
    onUndo?.();
    setShowUndo(false);
    setUndoTimer(10);
  };

  if (!isOpen && !showUndo) {
    return null;
  }

  const footer = (
    <div className="border-t border-border/60 bg-muted/20 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="rounded-full" onClick={onClose}>
          閉じる
        </Button>
        {isFullDocument ? (
          <Button className="rounded-full" onClick={handleCopyToClipboard}>
            {copied ? <Check className="size-4" /> : <Sparkles className="size-4" />}
            {copied ? "コピー済み" : "改善案をコピー"}
          </Button>
        ) : (
          <Button className="rounded-full" onClick={handleConfirm}>
            <Sparkles className="size-4" />
            この改善案を反映
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {showUndo ? <UndoToast undoTimer={undoTimer} onUndo={handleUndo} /> : null}

      {isOpen ? (
        isMobile ? (
          <Sheet open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <SheetContent side="bottom" className="h-[90vh] rounded-t-[28px] border-0 p-0">
              <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SheetTitle className="text-base">{title}</SheetTitle>
                    <SheetDescription className="mt-1 text-sm leading-6">
                      {description}
                    </SheetDescription>
                  </div>
                  <DiffBadge originalText={originalText} newText={newText} />
                </div>
              </SheetHeader>
              <div className="h-[calc(90vh-142px)] overflow-y-auto px-4 py-4">
                <ReflectContent
                  originalText={originalText}
                  newText={newText}
                  isFullDocument={isFullDocument}
                />
              </div>
              {footer}
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent className="max-w-4xl overflow-hidden rounded-[28px] border-border/60 p-0">
              <DialogHeader className="border-b border-border/60 px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="mt-2 text-sm leading-6">
                      {description}
                    </DialogDescription>
                  </div>
                  <DiffBadge originalText={originalText} newText={newText} />
                </div>
              </DialogHeader>
              <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
                <ReflectContent
                  originalText={originalText}
                  newText={newText}
                  isFullDocument={isFullDocument}
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
