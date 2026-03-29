"use client";

import { memo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  STARStatusBadge,
  STARProgressCompact,
  type STARScores,
} from "@/components/gakuchika";
import { Star, MoreVertical, Pencil, Trash2 } from "lucide-react";

interface Gakuchika {
  id: string;
  title: string;
  summary: string | null;
  summaryPreview?: string | null;
  summaryKind?: "structured" | "legacy" | "none";
  createdAt: string;
  updatedAt: string;
  conversationStatus: "in_progress" | "completed" | null;
  starScores: STARScores | null;
  questionCount: number;
}

interface GakuchikaCardProps {
  gakuchika: Gakuchika;
  isPinned: boolean;
  onTogglePin?: (id: string) => void;
  onEditStart?: (id: string, title: string) => void;
  onDeleteStart?: (id: string) => void;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function GakuchikaCardComponent({
  gakuchika,
  isPinned,
  onTogglePin,
  onEditStart,
  onDeleteStart,
}: GakuchikaCardProps) {
  const summaryText = gakuchika.summaryPreview
    ? gakuchika.summaryPreview
    : gakuchika.conversationStatus === "completed"
    ? "要約を生成中..."
    : gakuchika.conversationStatus === "in_progress"
    ? "作成中..."
    : "タップして作成を始める";

  return (
    <Link href={`/gakuchika/${gakuchika.id}`}>
      <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer group">
        <CardContent className="p-4 flex flex-col h-full">
          {/* Header: Star + Title + Status Badge */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {onTogglePin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onTogglePin(gakuchika.id);
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
                {gakuchika.title}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {onDeleteStart ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteStart(gakuchika.id);
                  }}
                  aria-label={`${gakuchika.title} を削除`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
              <STARStatusBadge scores={gakuchika.starScores} />
            </div>
          </div>

          {/* Summary preview */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {summaryText}
          </p>

          {/* STAR progress */}
          <div className="mb-3">
            <STARProgressCompact scores={gakuchika.starScores} />
          </div>

          {/* Footer: Date + Menu */}
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-auto">
            <span className="text-xs">
              更新: {formatDate(gakuchika.updatedAt)}
            </span>

            {/* 3-dot menu */}
            {onEditStart && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="end">
                  {onEditStart && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditStart(gakuchika.id, gakuchika.title);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                      タイトル編集
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export const GakuchikaCard = memo(GakuchikaCardComponent);
export type { Gakuchika };
