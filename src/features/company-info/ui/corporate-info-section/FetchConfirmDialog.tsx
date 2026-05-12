"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangleIcon } from "./icons";
import { formatEstimateSummary } from "./workflow-helpers";
import type { FetchConfirmation } from "./workflow-config";

interface FetchConfirmDialogProps {
  confirmation: FetchConfirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FetchConfirmDialog({
  confirmation,
  onConfirm,
  onCancel,
}: FetchConfirmDialogProps) {
  if (!confirmation) return null;

  const isSourceWarning = confirmation.kind === "source_warning";
  const estimate = confirmation.kind === "cost_estimate" ? confirmation.estimate : null;
  const estimateSummary = estimate
    ? formatEstimateSummary({
        totalPages: estimate.estimated_pages_crawled,
        localPages: Math.max(
          0,
          estimate.estimated_pages_crawled -
            estimate.estimated_google_ocr_pages -
            estimate.estimated_mistral_ocr_pages,
        ),
        googlePages: estimate.estimated_google_ocr_pages,
        mistralPages: estimate.estimated_mistral_ocr_pages,
        freePages: estimate.estimated_free_html_pages + estimate.estimated_free_pdf_pages,
        credits: estimate.estimated_credits,
        willTruncate: estimate.will_truncate,
      })
    : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangleIcon />
            </span>
            <DialogTitle>
              {isSourceWarning ? "取得前に確認してください" : "取得コストを確認してください"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {isSourceWarning
              ? "このソースは確認が必要です。内容を確認済みの場合のみ続行してください。"
              : "無料枠やOCR利用を含む見積です。内容を確認してから取得を実行してください。"}
          </DialogDescription>
        </DialogHeader>

        {isSourceWarning ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950">
            {confirmation.reason}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">ページ</p>
                <p className="font-semibold">{estimate?.estimated_pages_crawled ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">無料枠</p>
                <p className="font-semibold">
                  {(estimate?.estimated_free_html_pages ?? 0) +
                    (estimate?.estimated_free_pdf_pages ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">OCR</p>
                <p className="font-semibold">
                  {(estimate?.estimated_google_ocr_pages ?? 0) +
                    (estimate?.estimated_mistral_ocr_pages ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">credits</p>
                <p className="font-semibold">{estimate?.estimated_credits ?? 0}</p>
              </div>
            </div>
            {estimateSummary && (
              <p className="rounded-md bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                {estimateSummary}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={onConfirm}>
            {isSourceWarning ? "確認済みとして続行" : "取得を実行"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
