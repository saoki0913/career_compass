"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isUploadSource } from "@/lib/company-info/sources";
import { CheckIcon, ExternalLinkIcon, TrashIcon, XIcon } from "./icons";
import { CONTENT_TYPE_COLORS, CONTENT_TYPE_LABELS, SURFACE_CLASS } from "./constants";
import { formatTimestamp, getHostLabel, getSourceStatusMeta } from "./workflow-helpers";
import { mapLegacyToNew, type CorporateInfoStatus } from "./workflow-config";

interface RegisteredSourcesModalProps {
  status: CorporateInfoStatus;
  selectedUrlsForDelete: Set<string>;
  isDeleting: boolean;
  deleteError: string | null;
  toggleUrlForDelete: (url: string) => void;
  toggleSelectAllForDelete: () => void;
  setShowDeleteConfirm: (show: boolean) => void;
  closeUrlModal: () => void;
}

export function RegisteredSourcesModal({
  status,
  selectedUrlsForDelete,
  isDeleting,
  deleteError,
  toggleUrlForDelete,
  toggleSelectAllForDelete,
  setShowDeleteConfirm,
  closeUrlModal,
}: RegisteredSourcesModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex h-[78vh] max-h-[760px] min-h-[560px] w-full max-w-2xl flex-col overflow-hidden border-border/50">
        <CardHeader className="gap-3 border-b py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">登録済みソース</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                URL とアップロード資料をまとめて管理します
              </p>
            </div>
            <button
              type="button"
              onClick={closeUrlModal}
              className="rounded-full p-1.5 transition-colors hover:bg-background/70"
              disabled={isDeleting}
            >
              <XIcon />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto py-5">
          {status.corporateInfoUrls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                登録済みのソースはありません
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                企業情報を取得すると、ここに一覧で表示されます。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn(SURFACE_CLASS, "p-4")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={toggleSelectAllForDelete}
                    disabled={isDeleting}
                    className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors",
                        selectedUrlsForDelete.size === status.corporateInfoUrls.length
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      )}
                    >
                      {selectedUrlsForDelete.size === status.corporateInfoUrls.length && (
                        <CheckIcon />
                      )}
                    </span>
                    すべて選択
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                      全 {status.corporateInfoUrls.length} 件
                    </span>
                    {selectedUrlsForDelete.size > 0 && (
                      <span className="rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-destructive">
                        {selectedUrlsForDelete.size}件選択中
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {status.corporateInfoUrls.map((urlInfo, i) => {
                  const resolvedType =
                    urlInfo.contentType ||
                    (urlInfo.type ? mapLegacyToNew(urlInfo.type) : null);
                  const secondaryTypes = Array.isArray(urlInfo.secondaryContentTypes)
                    ? urlInfo.secondaryContentTypes
                    : [];
                  const uploadSource =
                    urlInfo.kind === "upload_pdf" || isUploadSource(urlInfo.url);
                  const colors = resolvedType
                    ? CONTENT_TYPE_COLORS[resolvedType] || {
                        bg: "bg-gray-100",
                        text: "text-gray-700",
                      }
                    : null;
                  const label = resolvedType
                    ? CONTENT_TYPE_LABELS[resolvedType] || CONTENT_TYPE_LABELS["corporate_site"]
                    : null;
                  const statusMeta = getSourceStatusMeta(urlInfo.status);
                  const isSelected = selectedUrlsForDelete.has(urlInfo.url);
                  const isBlocked = urlInfo.complianceStatus === "blocked";
                  const isWarning = urlInfo.complianceStatus === "warning";

                  return (
                    <div
                      key={i}
                      className={cn(
                        SURFACE_CLASS,
                        "flex items-start gap-3 p-4 transition-colors",
                        isSelected
                          ? "border-destructive/25 bg-destructive/5"
                          : "hover:border-border hover:bg-muted/10"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleUrlForDelete(urlInfo.url)}
                        disabled={isDeleting}
                        className="mt-0.5 flex-shrink-0"
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors",
                            isSelected
                              ? "border-destructive bg-destructive text-destructive-foreground"
                              : "border-muted-foreground/40 hover:border-muted-foreground"
                          )}
                        >
                          {isSelected && <CheckIcon />}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {label && colors ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                                colors.bg,
                                colors.text
                              )}
                            >
                              {label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                              自動判定中
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            {uploadSource ? "PDF" : "URL"}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                              statusMeta.className
                            )}
                          >
                            {statusMeta.label}
                          </span>
                          {isBlocked && (
                            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                              取得対象外
                            </span>
                          )}
                          {isWarning && (
                            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                              要確認
                            </span>
                          )}
                          {secondaryTypes.map((secondary, idx) => {
                            const secColors = CONTENT_TYPE_COLORS[secondary] || {
                              bg: "bg-gray-100",
                              text: "text-gray-700",
                            };
                            const secLabel =
                              CONTENT_TYPE_LABELS[secondary] ||
                              CONTENT_TYPE_LABELS["corporate_site"];
                            return (
                              <span
                                key={`${secondary}-${idx}`}
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                  secColors.bg,
                                  secColors.text
                                )}
                              >
                                {secLabel}
                              </span>
                            );
                          })}
                        </div>

                        {uploadSource ? (
                          <div className="mt-3 space-y-1">
                            <p className="break-all text-sm font-medium text-foreground">
                              {urlInfo.fileName || "アップロードPDF"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {urlInfo.status === "pending" || urlInfo.status === "processing"
                                ? "OCRが完了すると自動で分類されます"
                                : "PDFアップロード"}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            <a
                              href={urlInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group inline-flex max-w-full items-center gap-1 text-sm font-medium text-primary"
                            >
                              <span className="truncate group-hover:underline">{urlInfo.url}</span>
                              <ExternalLinkIcon />
                            </a>
                            <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                              {getHostLabel(urlInfo.url)}
                            </div>
                            {isBlocked && urlInfo.complianceReasons?.[0] && (
                              <p className="text-xs text-amber-700">{urlInfo.complianceReasons[0]}</p>
                            )}
                            {isWarning && urlInfo.complianceReasons?.[0] && (
                              <p className="text-xs text-amber-700">{urlInfo.complianceReasons[0]}</p>
                            )}
                          </div>
                        )}

                        {urlInfo.fetchedAt && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            取得日時: {formatTimestamp(urlInfo.fetchedAt)}
                          </p>
                        )}
                        {urlInfo.errorMessage && (
                          <p className="mt-2 text-xs text-destructive">{urlInfo.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {deleteError && (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                    <p className="text-sm text-destructive">{deleteError}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex gap-3 border-t bg-muted/15 px-6 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={closeUrlModal}
            disabled={isDeleting}
          >
            閉じる
          </Button>
          {selectedUrlsForDelete.size > 0 && (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              <TrashIcon />
              <span className="ml-1.5">{selectedUrlsForDelete.size}件を削除</span>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
