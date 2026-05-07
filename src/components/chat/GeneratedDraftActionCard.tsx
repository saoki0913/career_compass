"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GeneratedDraftActionCardProps {
  title?: string;
  draft: string;
  charLimit: 300 | 400 | 500;
  documentId?: string | null;
  primaryLabel?: string;
  onOpenPreview: () => void;
  onDeepDive?: () => void | Promise<void>;
  isBusy?: boolean;
  className?: string;
}

export function GeneratedDraftActionCard({
  title = "生成した下書き",
  draft,
  charLimit,
  documentId,
  primaryLabel = "ESエディタを開く",
  onOpenPreview,
  onDeepDive,
  isBusy = false,
  className,
}: GeneratedDraftActionCardProps) {
  const normalizedDraft = draft.trim();
  const charCount = normalizedDraft.length;

  return (
    <section
      className={cn(
        "rounded-[28px] border border-border/70 bg-background/95 px-3 py-3 shadow-sm",
        className,
      )}
      aria-label={title}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-primary" aria-hidden />
              {title}
            </span>
            <Badge variant="soft-info" className="shrink-0 px-3 py-1 text-xs">
              {charCount}字 / {charLimit}字
            </Badge>
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground xl:max-w-[34rem]">
            {normalizedDraft || "本文がありません。"}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onOpenPreview}
          disabled={isBusy}
          className="h-10 w-full rounded-2xl xl:w-auto"
          aria-haspopup="dialog"
        >
          下書きを確認する
        </Button>

        {documentId ? (
          <Button asChild className="h-11 w-full rounded-2xl px-5 xl:w-auto xl:min-w-[220px]">
            <Link href={`/es/${documentId}`}>{primaryLabel}</Link>
          </Button>
        ) : (
          <Button
            type="button"
            className="h-11 w-full rounded-2xl px-5 xl:w-auto xl:min-w-[220px]"
            onClick={onOpenPreview}
            disabled={isBusy}
          >
            {primaryLabel}
          </Button>
        )}
      </div>

      {onDeepDive ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs"
            disabled={isBusy}
            onClick={() => {
              void onDeepDive();
            }}
          >
            もっと深掘りして再生成する
          </Button>
        </div>
      ) : null}
    </section>
  );
}
