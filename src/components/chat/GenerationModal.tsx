"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, FileText, Info, Loader2, PenLine, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import type { GenerationStatus } from "./generation-modal-status";

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

const ICON_MAP = { draft: Sparkles, feedback: PenLine, sheet: FileText } as const;

export type GenerationModalRequirement = {
  label: string;
  met: boolean;
  description?: string;
};

export type GenerationModalSecondaryAction = {
  label: string;
  onClick: () => void;
  /** 実行前に確認ダイアログを挟む場合に指定（ガクチカの下書き削除など）。 */
  confirm?: { title: string; description: string; confirmLabel: string } | null;
  /** done スロット内に出す事前警告（深掘りで下書きが消える等）。 */
  notice?: ReactNode;
  disabled?: boolean;
};

export type GenerationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 状態機械。resolveGenerationStatus で算出した値を渡す。 */
  status: GenerationStatus;
  title: string;
  description?: string;
  icon?: keyof typeof ICON_MAP;
  /** locked/ready 時にボディ上部へ出す補助文言（例: 面接完了後に最終講評を作成できます）。 */
  helperText?: ReactNode;
  /** locked 時の未達理由（1行サマリ）。 */
  lockedReason?: ReactNode;
  /** locked 時の達成条件チェックリスト。 */
  requirements?: GenerationModalRequirement[];
  /** ready 時の設定 UI（ES の文字数選択など）。 */
  settingsSlot?: ReactNode;
  /** ready 時の補足（使用材料リストなど）。 */
  readyInfoSlot?: ReactNode;
  /** generating 時の進捗表示（SSE ストリーミングなど）。未指定なら既定のスピナー。 */
  generatingSlot?: ReactNode;
  /** generating 時の進捗ラベル。 */
  generatingLabel?: ReactNode;
  /** done 時の結果本体。 */
  resultSlot?: ReactNode;
  /** ready 時の生成実行アクション。 */
  generateAction?: { label: string; onGenerate: () => void | Promise<void>; disabled?: boolean };
  /** done 時の主アクション（エディタを開くなど）。 */
  primaryAction?: { label: string; onClick: () => void; loading?: boolean };
  /** done 時の副アクション（深掘り再生成など。確認ダイアログ対応）。 */
  secondaryAction?: GenerationModalSecondaryAction;
  /** ヘッダー右の追加 UI（PDF/印刷など）。 */
  headerExtraSlot?: ReactNode;
  size?: "wide" | "standard";
};

function GeneratingIndicator({ label }: { label?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium text-foreground">{label || "生成しています"}</p>
      <p className="text-xs text-muted-foreground">完了するまでこの画面のままお待ちください。</p>
    </div>
  );
}

function RequirementList({ requirements }: { requirements: GenerationModalRequirement[] }) {
  return (
    <ul className="space-y-2">
      {requirements.map((req, index) => (
        <li
          key={`${req.label}-${index}`}
          className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/15 px-3 py-2.5"
          aria-label={`${req.label}: ${req.met ? "達成済み" : "未達"}`}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              req.met ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{req.label}</span>
            {req.description ? (
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{req.description}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ModalBody({
  status,
  helperText,
  lockedReason,
  requirements,
  settingsSlot,
  readyInfoSlot,
  generatingSlot,
  generatingLabel,
  resultSlot,
  secondaryNotice,
  blocking,
  mobile,
}: {
  status: GenerationStatus;
  helperText?: ReactNode;
  lockedReason?: ReactNode;
  requirements?: GenerationModalRequirement[];
  settingsSlot?: ReactNode;
  readyInfoSlot?: ReactNode;
  generatingSlot?: ReactNode;
  generatingLabel?: ReactNode;
  resultSlot?: ReactNode;
  secondaryNotice?: ReactNode;
  blocking: boolean;
  mobile: boolean;
}) {
  const showHelper = (status === "locked" || status === "ready") && Boolean(helperText);
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto", mobile ? "px-4 py-4" : "px-6 py-5")}
      aria-busy={status === "generating"}
      aria-live="polite"
    >
      {blocking ? (
        <div className="mb-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-foreground/85">
          生成処理中のため、完了するまでこの画面は閉じられません。
        </div>
      ) : null}

      {showHelper ? (
        <div className="mb-4 flex gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-foreground/85">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p>{helperText}</p>
        </div>
      ) : null}

      {status === "locked" ? (
        <div className="space-y-4">
          {lockedReason ? (
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {lockedReason}
            </div>
          ) : null}
          {requirements && requirements.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">生成できる条件</h3>
              <RequirementList requirements={requirements} />
            </section>
          ) : null}
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-5">
          {settingsSlot}
          {readyInfoSlot}
        </div>
      ) : null}

      {status === "generating" ? (
        <>{generatingSlot ?? <GeneratingIndicator label={generatingLabel} />}</>
      ) : null}

      {status === "done" ? (
        <div className="space-y-4">
          {secondaryNotice}
          {resultSlot}
        </div>
      ) : null}
    </div>
  );
}

function ModalFooter({
  status,
  onClose,
  generateAction,
  primaryAction,
  secondaryAction,
  mobile,
  blocking,
  onGenerate,
}: {
  status: GenerationStatus;
  onClose: () => void;
  generateAction?: GenerationModalProps["generateAction"];
  primaryAction?: GenerationModalProps["primaryAction"];
  secondaryAction?: GenerationModalSecondaryAction;
  mobile: boolean;
  blocking: boolean;
  onGenerate: () => void;
}) {
  const deepDiveButton = secondaryAction
    ? secondaryAction.confirm
      ? (
          <Button variant="outline" className="rounded-full" disabled={secondaryAction.disabled} asChild>
            <AlertDialogTrigger>{secondaryAction.label}</AlertDialogTrigger>
          </Button>
        )
      : (
          <Button
            variant="outline"
            className="rounded-full"
            disabled={secondaryAction.disabled}
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        )
    : null;

  return (
    <div className={cn("shrink-0 border-t border-border/60", mobile ? "px-4 py-4" : "px-6 py-4")}>
      <div className={cn("flex gap-3", mobile ? "flex-col-reverse" : "flex-row justify-end")}>
        {status === "locked" ? (
          <Button variant="outline" className="rounded-full" onClick={onClose} disabled={blocking}>
            閉じる
          </Button>
        ) : null}

        {status === "ready" && generateAction ? (
          <>
            <Button variant="outline" className="rounded-full" onClick={onClose} disabled={blocking}>
              キャンセル
            </Button>
            <Button
              className={cn("rounded-full", !mobile && "min-w-[12rem]")}
              onClick={onGenerate}
              disabled={generateAction.disabled || blocking}
            >
              {blocking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              )}
              {generateAction.label}
            </Button>
          </>
        ) : null}

        {status === "done" ? (
          <>
            {deepDiveButton}
            {primaryAction ? (
              <Button
                className={cn("rounded-full", !mobile && "min-w-[11rem]")}
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading}
              >
                {primaryAction.loading ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                {primaryAction.label}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {secondaryAction?.confirm ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{secondaryAction.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{secondaryAction.confirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={secondaryAction.onClick}>
              {secondaryAction.confirm.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </div>
  );
}

export function GenerationModal({
  open,
  onOpenChange,
  status,
  title,
  description,
  icon = "draft",
  helperText,
  lockedReason,
  requirements,
  settingsSlot,
  readyInfoSlot,
  generatingSlot,
  generatingLabel,
  resultSlot,
  generateAction,
  primaryAction,
  secondaryAction,
  headerExtraSlot,
  size = "wide",
}: GenerationModalProps) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const Icon = ICON_MAP[icon];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const isBlockingClose = status === "generating" || isSubmitting || submittingRef.current;

  const handleGenerate = () => {
    if (!generateAction || generateAction.disabled || isBlockingClose || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    void (async () => {
      try {
        await generateAction.onGenerate();
      } catch {
        // 呼び出し側の生成処理がユーザー向けエラーを出すため、共通モーダル側では未処理拒否だけを防ぐ。
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    })();
  };

  const body = (
    <ModalBody
      status={status}
      helperText={helperText}
      lockedReason={lockedReason}
      requirements={requirements}
      settingsSlot={settingsSlot}
      readyInfoSlot={readyInfoSlot}
      generatingSlot={generatingSlot}
      generatingLabel={generatingLabel}
      resultSlot={resultSlot}
      secondaryNotice={secondaryAction?.notice}
      blocking={isBlockingClose}
      mobile={isMobile}
    />
  );

  const footerInner = (
    <ModalFooter
      status={status}
      onClose={() => onOpenChange(false)}
      generateAction={generateAction}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      mobile={isMobile}
      blocking={isBlockingClose}
      onGenerate={handleGenerate}
    />
  );
  const footer = secondaryAction?.confirm ? <AlertDialog>{footerInner}</AlertDialog> : footerInner;

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (isBlockingClose) return;
          if (!next) onOpenChange(false);
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={!isBlockingClose}
          className="flex h-[94dvh] flex-col rounded-t-2xl border-0 p-0"
          onEscapeKeyDown={(event) => {
            if (isBlockingClose) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isBlockingClose) event.preventDefault();
          }}
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{title}</span>
                </SheetTitle>
                {description ? (
                  <SheetDescription className="mt-1 text-sm leading-snug">{description}</SheetDescription>
                ) : null}
              </div>
              {headerExtraSlot ? <div className="shrink-0">{headerExtraSlot}</div> : null}
            </div>
          </SheetHeader>
          {body}
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isBlockingClose) return;
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        showCloseButton={!isBlockingClose}
        onEscapeKeyDown={(event) => {
          if (isBlockingClose) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBlockingClose) event.preventDefault();
        }}
        className={cn(
          "flex max-h-[min(96vh,1040px)] flex-col overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg",
          size === "wide" ? "max-w-7xl" : "max-w-3xl",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-2xl">{title}</DialogTitle>
                {description ? (
                  <DialogDescription className="mt-1 text-base leading-snug text-muted-foreground">
                    {description}
                  </DialogDescription>
                ) : null}
              </div>
            </div>
            {headerExtraSlot ? <div className="shrink-0">{headerExtraSlot}</div> : null}
          </div>
        </DialogHeader>
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
