"use client";

import { memo } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export type DraftResultQuality = {
  status?: "passed" | "repaired" | "warning";
  warnings?: string[];
  retry_count?: number;
  retryCount?: number;
  failure_codes?: string[];
  selection_reason?: string;
  selectionReason?: string;
} | null;

/**
 * 生成済み ES 本文のプレビュー (GenerationModal の resultSlot)。
 * 旧 DraftPreviewModal の DraftBody を抽出したもの。文字数バッジ・品質警告・本文を表示する。
 */
export const DraftResultView = memo(function DraftResultView({
  draft,
  charLimit,
  draftQuality,
  preBodyNotice,
}: {
  draft: string;
  charLimit: number;
  draftQuality?: DraftResultQuality;
  preBodyNotice?: ReactNode;
}) {
  const charCount = draft.length;
  const qualityWarnings = draftQuality?.warnings?.filter(Boolean) ?? [];
  const retryCount = draftQuality?.retry_count ?? draftQuality?.retryCount ?? 0;
  const shouldShowQualityNotice =
    draftQuality?.status === "warning" ||
    draftQuality?.status === "repaired" ||
    qualityWarnings.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-end">
        <Badge variant="soft-info" className="shrink-0 px-3 py-1 text-xs">
          {charCount}字 / {charLimit}字
        </Badge>
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
