"use client";

import { memo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Document } from "@/hooks/useDocuments";
import { DOCUMENT_TYPE_LABELS } from "@/hooks/useDocuments";
import { ES_DOCUMENT_CATEGORY_LABELS } from "@/lib/es-document-category";
import { Star, Building2, FileText } from "lucide-react";

const STATUS_CONFIG = {
  draft: { label: "下書き", bgColor: "bg-amber-100", color: "text-amber-700" },
  published: { label: "提出済み", bgColor: "bg-emerald-100", color: "text-emerald-700" },
  deleted: { label: "削除済み", bgColor: "bg-gray-100", color: "text-gray-600" },
} as const;

interface ESCardProps {
  document: Document;
  isPinned: boolean;
  onTogglePin?: (documentId: string) => void;
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
  onToggleStatus,
  statusUpdatingId,
}: ESCardProps) {
  const statusConfig = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft;
  const categoryLabel =
    doc.type === "es"
      ? ES_DOCUMENT_CATEGORY_LABELS[doc.esCategory ?? "entry_sheet"]
      : DOCUMENT_TYPE_LABELS[doc.type];

  return (
    <Link href={`/es/${doc.id}`}>
      <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer group">
        <CardContent className="p-4 flex flex-col h-full">
          {/* Header: Star + Title + Status */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {onTogglePin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onTogglePin(doc.id);
                  }}
                  className={cn(
                    "flex-shrink-0 p-1 -ml-1 rounded-md transition-all duration-200",
                    "hover:scale-110 active:scale-95",
                    "min-w-[28px] min-h-[28px] flex items-center justify-center",
                    isPinned
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-muted-foreground/50 hover:text-amber-400"
                  )}
                  title={isPinned ? "お気に入り解除" : "お気に入りに追加"}
                  aria-label={isPinned ? "お気に入り解除" : "お気に入りに追加"}
                >
                  <Star
                    className={cn(
                      "w-4 h-4 transition-all duration-200",
                      isPinned && "fill-current"
                    )}
                  />
                </button>
              )}
              <h3 className="font-semibold text-base text-foreground truncate group-hover:text-primary transition-colors">
                {doc.title}
              </h3>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-2 py-0.5 h-6 flex-shrink-0 font-medium",
                statusConfig.bgColor,
                statusConfig.color
              )}
            >
              {statusConfig.label}
            </Badge>
          </div>

          {/* Company */}
          <p className="text-sm text-muted-foreground mb-2 truncate flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            {doc.company?.name || "企業未設定"}
          </p>

          {/* Document type badge */}
          <div className="mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {categoryLabel}
            </span>
          </div>

          {/* Footer: Date + Status toggle */}
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-auto">
            <span className="text-xs">
              更新: {formatDate(doc.updatedAt)}
            </span>
            {onToggleStatus && doc.status !== "deleted" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onToggleStatus(doc.id, doc.status);
                }}
                disabled={statusUpdatingId === doc.id}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                  doc.status === "published"
                    ? "bg-muted text-muted-foreground hover:bg-muted/80"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
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
    </Link>
  );
}

export const ESCard = memo(ESCardComponent);
