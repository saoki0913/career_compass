"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, XIcon } from "./icons";
import { CONTENT_TYPE_LABELS, SURFACE_CLASS } from "./constants";
import { getBatchItemStatusMeta, getExtractionMethodLabel } from "./workflow-helpers";
import type { FetchResult } from "./workflow-config";

interface ResultStepProps {
  fetchResult: FetchResult;
  closeModal: () => void;
}

export function ResultStep({ fetchResult, closeModal }: ResultStepProps) {
  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <div
        className={cn(
          `${SURFACE_CLASS} p-4`,
          fetchResult.success
            ? "border-emerald-200 bg-emerald-50/90"
            : "border-amber-200 bg-amber-50/90"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl border",
                fetchResult.success
                  ? "border-emerald-200 bg-emerald-100 text-emerald-600"
                  : "border-amber-200 bg-amber-100 text-amber-600"
              )}
            >
              {fetchResult.success ? <CheckIcon /> : <XIcon />}
            </div>
            <div>
              <p
                className={cn(
                  "text-sm font-semibold",
                  fetchResult.success ? "text-emerald-800" : "text-amber-800"
                )}
              >
                {fetchResult.success ? "取得が完了しました" : "一部の取得に失敗しました"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                取り込み結果を確認して、必要なら追加のソースを登録してください。
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              fetchResult.success
                ? "border-emerald-200/80 bg-emerald-100/80 text-emerald-700"
                : "border-amber-200/80 bg-amber-100/80 text-amber-700"
            )}
          >
            {fetchResult.success ? "登録完了" : "要確認"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            fetchResult.sourceLabel
              ? { label: "取得元", value: fetchResult.sourceLabel }
              : null,
            { label: "取得ページ数", value: String(fetchResult.pagesCrawled) },
            { label: "保存チャンク数", value: fetchResult.chunksStored.toLocaleString("ja-JP") },
            fetchResult.summary
              ? {
                  label: "同期完了",
                  value: `${fetchResult.summary.completed.toLocaleString("ja-JP")}件`,
                }
              : null,
            fetchResult.summary && fetchResult.summary.pending > 0
              ? {
                  label: "OCR保留",
                  value: `${fetchResult.summary.pending.toLocaleString("ja-JP")}件`,
                }
              : null,
            typeof fetchResult.actualUnits === "number"
              ? {
                  label: "今回の取込ページ",
                  value: fetchResult.actualUnits.toLocaleString("ja-JP"),
                }
              : null,
            typeof fetchResult.totalUnits === "number" && fetchResult.totalUnits > 0
              ? {
                  label: "合計取込ページ",
                  value: fetchResult.totalUnits.toLocaleString("ja-JP"),
                }
              : null,
            typeof fetchResult.freeUnitsApplied === "number"
              ? {
                  label: "無料枠に充当",
                  value: `${fetchResult.freeUnitsApplied.toLocaleString("ja-JP")} ページ`,
                }
              : null,
            typeof fetchResult.remainingFreeUnits === "number"
              ? {
                  label: "無料枠の残り",
                  value: `${fetchResult.remainingFreeUnits.toLocaleString("ja-JP")} ページ`,
                }
              : null,
            typeof fetchResult.creditsConsumed === "number"
              ? {
                  label: "表示上の消費",
                  value: `${fetchResult.creditsConsumed.toLocaleString("ja-JP")} クレジット`,
                }
              : null,
            typeof fetchResult.actualCreditsDeducted === "number"
              ? {
                  label: "実際の消費",
                  value: `${fetchResult.actualCreditsDeducted.toLocaleString("ja-JP")} クレジット`,
                }
              : null,
            fetchResult.estimatedCostBand
              ? {
                  label: "今回の課金帯",
                  value: fetchResult.estimatedCostBand,
                }
              : null,
            fetchResult.extractionMethod
              ? {
                  label: "抽出方法",
                  value: getExtractionMethodLabel(fetchResult.extractionMethod),
                }
              : null,
            typeof fetchResult.extractedChars === "number" && fetchResult.extractedChars > 0
              ? {
                  label: "抽出文字数",
                  value: fetchResult.extractedChars.toLocaleString("ja-JP"),
                }
              : null,
          ]
            .filter((item): item is { label: string; value: string } => Boolean(item))
            .map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/70 bg-white/70 px-3 py-3"
              >
                <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
              </div>
            ))}
        </div>

        {fetchResult.items && fetchResult.items.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/70 bg-white/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">各ファイルの取り込み結果</p>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {fetchResult.items.map((item) => {
                const statusMeta = getBatchItemStatusMeta(item.status);
                return (
                  <div
                    key={`${item.fileName}-${item.sourceUrl || item.status}`}
                    className="rounded-lg border border-border/70 bg-background/80 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.fileName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {typeof item.chunksStored === "number" && item.chunksStored > 0 && (
                            <span>保存チャンク {item.chunksStored.toLocaleString("ja-JP")}</span>
                          )}
                          {typeof item.extractedChars === "number" && item.extractedChars > 0 && (
                            <span>抽出文字数 {item.extractedChars.toLocaleString("ja-JP")}</span>
                          )}
                          {item.extractionMethod && (
                            <span>{getExtractionMethodLabel(item.extractionMethod)}</span>
                          )}
                          {item.contentType && (
                            <span>{CONTENT_TYPE_LABELS[item.contentType] || item.contentType}</span>
                          )}
                        </div>
                        {item.error && (
                          <p className="mt-2 text-xs text-destructive">{item.error}</p>
                        )}
                        {item.status === "completed" && item.processingNoticeJa ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                            {item.processingNoticeJa}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          statusMeta.className
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {fetchResult.errors.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/70 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">エラー</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
              {fetchResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={closeModal} size="sm">
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
