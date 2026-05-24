"use client";

import { memo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ES_CARD_CLASS, ES_CARD_CONTENT_CLASS, ES_CARD_LINK_FOCUS_CLASS } from "./es-list-layout";
import type { Document } from "@/hooks/useDocuments";
import { DOCUMENT_TYPE_LABELS } from "@/hooks/useDocuments";
import { ES_DOCUMENT_CATEGORY_LABELS } from "@/lib/es-document-category";
import { Star, Building2, Trash2 } from "lucide-react";

const STATUS_CONFIG = {
  draft: { label: "下書き", bgColor: "bg-amber-100", color: "text-amber-700" },
  published: { label: "提出済み", bgColor: "bg-sky-100", color: "text-sky-700" },
  deleted: { label: "削除済み", bgColor: "bg-gray-100", color: "text-gray-600" },
} as const;

interface ESCardProps {
  document: Document;
  isPinned: boolean;
  onTogglePin?: (documentId: string) => void;
  onDeleteStart?: (documentId: string) => void;
  onToggleStatus?: (documentId: string, currentStatus: string) => void;
  statusUpdatingId?: string | null;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ESCardComponent({
  document: doc,
  isPinned,
  onTogglePin,
  onDeleteStart,
  onToggleStatus,
  statusUpdatingId,
}: ESCardProps) {
  const statusConfig = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft;
  const categoryLabel =
    doc.type === "es"
      ? ES_DOCUMENT_CATEGORY_LABELS[doc.esCategory ?? "entry_sheet"]
      : DOCUMENT_TYPE_LABELS[doc.type];
  const href = `/es/${doc.id}`;

  return (
    <Card className={ES_CARD_CLASS}>
      <CardContent className={ES_CARD_CONTENT_CLASS}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            {onTogglePin && (
              <button
                type="button"
                onClick={() => onTogglePin(doc.id)}
                className={cn(
                  "-ml-1.5 flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                  "hover:scale-110 active:scale-95",
                  isPinned
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-muted-foreground/50 hover:text-amber-400"
                )}
                title={isPinned ? "お気に入り解除" : "お気に入りに追加"}
                aria-label={isPinned ? "お気に入り解除" : "お気に入りに追加"}
              >
                <Star
                  className={cn(
                    "h-[1.15rem] w-[1.15rem] transition-all duration-200",
                    isPinned && "fill-current"
                  )}
                />
              </button>
            )}
            <Link href={href} className={cn("min-w-0 flex-1", ES_CARD_LINK_FOCUS_CLASS)}>
              <h3 className="truncate pt-1 text-[0.95rem] font-bold leading-5 text-foreground transition-colors group-hover:text-primary sm:text-sm">
                {doc.title}
              </h3>
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            {onDeleteStart && doc.status !== "deleted" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-xl text-slate-500 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDeleteStart(doc.id)}
                aria-label={`${doc.title} をゴミ箱に移動`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <Link href={href} className={cn("mb-1.5 flex items-center justify-between gap-2", ES_CARD_LINK_FOCUS_CLASS)}>
          <p className="flex min-w-0 items-center gap-1 truncate text-[0.8rem] text-slate-600">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            {doc.company?.name || "企業未設定"}
          </p>
          <Badge
            variant="outline"
            className={cn(
              "h-6 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
              statusConfig.bgColor,
              statusConfig.color
            )}
          >
            {statusConfig.label}
          </Badge>
        </Link>

        <Link href={href} className={cn("mb-1.5 inline-flex w-fit", ES_CARD_LINK_FOCUS_CLASS)}>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
            {categoryLabel}
          </span>
        </Link>

        <div className="mt-auto flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <Link href={href} className={cn("min-w-0 truncate text-[0.8rem] text-slate-600", ES_CARD_LINK_FOCUS_CLASS)}>
            更新: {formatDate(doc.updatedAt)}
          </Link>
          {onToggleStatus && doc.status !== "deleted" && (
            <button
              type="button"
              onClick={() => onToggleStatus(doc.id, doc.status)}
              disabled={statusUpdatingId === doc.id}
              className={cn(
                "min-h-11 sm:min-h-8 min-w-[6.75rem] rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                doc.status === "published"
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "bg-sky-100 text-sky-700 hover:bg-sky-200"
              )}
            >
              {statusUpdatingId === doc.id
                ? "更新中..."
                : doc.status === "published"
                ? "下書きに戻す"
                : "提出済みにする"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const ESCard = memo(ESCardComponent);
