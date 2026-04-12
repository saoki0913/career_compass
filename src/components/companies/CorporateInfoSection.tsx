"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BuildingIcon,
  FileUploadIcon,
  GlobeIcon,
  LinkIcon,
  LoadingSpinner,
  SparklesIcon,
  XIcon,
} from "./corporate-info-section/icons";
import { STATS_GROUPS, SURFACE_CLASS } from "./corporate-info-section/constants";
import { useCorporateInfoSectionController } from "./corporate-info-section/use-corporate-info-controller";
import { ResultStep } from "./corporate-info-section/ResultStep";
import { WebSearchStep } from "./corporate-info-section/WebSearchStep";
import { UrlInputStep } from "./corporate-info-section/UrlInputStep";
import { PdfUploadStep } from "./corporate-info-section/PdfUploadStep";
import { RegisteredSourcesModal } from "./corporate-info-section/RegisteredSourcesModal";
import { RagDetailModal } from "./corporate-info-section/RagDetailModal";
import { DeleteConfirmDialog } from "./corporate-info-section/DeleteConfirmDialog";
import { type InputMode, type ModalStep } from "./corporate-info-section/workflow-config";

interface CorporateInfoSectionProps {
  companyId: string;
  companyName: string;
  onUpdate?: () => void;
}

export function CorporateInfoSection({
  companyId,
  companyName,
  onUpdate,
}: CorporateInfoSectionProps) {
  const controller = useCorporateInfoSectionController({
    companyId,
    companyName,
    onUpdate,
  });

  const {
    plan,
    companyRagHtmlPagesLimit,
    companyRagHtmlPagesRemaining,
    companyRagPdfPagesLimit,
    companyRagPdfPagesRemaining,
    isLocked,
    status,
    isLoading,
    error,
    showModal,
    showUrlModal,
    showRagModal,
    isSearching,
    isFetching,
    webDraft,
    urlDraft,
    pdfDraft,
    fetchResult,
    isUploading,
    pdfUploadProgress,
    pdfPageEstimates,
    pdfEstimate,
    pdfEstimateLoading,
    displayedStep,
    isStepTransitioning,
    selectedUrlsForDelete,
    showDeleteConfirm,
    isDeleting,
    deleteError,
    inputMode,
    urlCountsByType,
    sourceStatusCounts,
    parsedCustomUrls,
    orderedCandidates,
    allCandidateUrls,
    resolvedWebContentType,
    activeModalStep,
    isResultDisplayed,
    showWebReviewStep,
    showConfigureStep,
    isModalBusy,
    ragStatus,
    hasAnyData,
    totalSources,
    pageLimit,
    sourceUsagePercent,
    shouldShowRagAllowance,
    ragUnitUsagePercent,
    lastUpdatedLabel,
    pdfUploadInputId,
    ragPdfPolicySummaryJa,
    isStepNavigable,
    handleStepNavigation,
    openModal,
    closeModal,
    openUrlModal,
    closeUrlModal,
    closeRagModal,
    handleTypeSearch,
    handleCustomSearch,
    handleFetchCorporateInfo,
    handleUploadPdf,
    handleModeSwitch,
    toggleUrl,
    toggleUrlForDelete,
    toggleSelectAllForDelete,
    handleDeleteUrls,
    setShowDeleteConfirm,
    setWebDraft,
    setUrlDraft,
    setPdfDraft,
  } = controller;

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BuildingIcon />
            企業情報データベース
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Main info card */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BuildingIcon />
            企業情報データベース
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={openModal}
            disabled={isLocked}
          >
            <SparklesIcon />
            企業情報を取得
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <p className="text-sm text-muted-foreground">
            ES添削や志望動機づくりに使う企業ソースを整理します。
          </p>

          {shouldShowRagAllowance ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex flex-col gap-2 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">今月の企業RAG無料枠</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`URL ${companyRagHtmlPagesRemaining.toLocaleString("ja-JP")} / ${companyRagHtmlPagesLimit.toLocaleString("ja-JP")} ページ、PDF ${companyRagPdfPagesRemaining.toLocaleString("ja-JP")} / ${companyRagPdfPagesLimit.toLocaleString("ja-JP")} ページ`}
                  </p>
                </div>
                <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  1社あたり上限 {pageLimit} ソース
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${ragUnitUsagePercent}%` }}
                />
              </div>
            </div>
          ) : null}

          {!hasAnyData ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <BuildingIcon />
              </div>
              <p className="text-sm font-medium text-foreground">
                まだ企業情報が登録されていません
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                企業情報ページを取得して、ES添削の精度を高めるためのソースを準備しましょう。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <p className="text-xs font-medium text-muted-foreground">登録済みソース</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{totalSources}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Web・URL・PDF をまとめて管理</p>
                </div>
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <p className="text-xs font-medium text-muted-foreground">保存チャンク</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {ragStatus?.totalChunks?.toLocaleString("ja-JP") || 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">ES添削で参照できるテキスト量</p>
                </div>
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">利用状況</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {pageLimit > 0 ? `${Math.round(sourceUsagePercent)}%` : "0%"}
                      </p>
                    </div>
                    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                      {totalSources} / {pageLimit || 0}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${sourceUsagePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {STATS_GROUPS.map((group) => (
                <div key={group.groupName} className={cn(SURFACE_CLASS, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{group.groupName}</p>
                    <span className="text-xs text-muted-foreground">
                      {group.items.reduce((sum, item) => sum + (urlCountsByType[item.key] || 0), 0)}件
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.items.map((config) => {
                      const count = urlCountsByType[config.key] || 0;
                      const hasData = count > 0;
                      return (
                        <div
                          key={config.key}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                            hasData
                              ? `${config.colorClass} shadow-xs`
                              : "border-border/60 bg-muted/20 text-muted-foreground"
                          )}
                          title={config.label}
                        >
                          <span className="text-xs font-medium">{config.shortLabel}</span>
                          <span className="text-sm font-semibold leading-none">{count}</span>
                          {hasData && (
                            <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {(sourceStatusCounts.pending > 0 || sourceStatusCounts.processing > 0) && (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {sourceStatusCounts.pending > 0 && (
                      <span className="inline-flex rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-700">
                        OCR保留 {sourceStatusCounts.pending}件
                      </span>
                    )}
                    {sourceStatusCounts.processing > 0 && (
                      <span className="inline-flex rounded-full border border-sky-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-sky-700">
                        処理中 {sourceStatusCounts.processing}件
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-amber-900/80">
                    カテゴリ別の件数には、自動判定前のPDFはまだ含まれません。登録済みソース一覧には反映されています。
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {lastUpdatedLabel ? `最新更新: ${lastUpdatedLabel}` : "まだ更新履歴はありません"}
                </p>
                {totalSources > 0 && (
                  <Button variant="outline" size="sm" onClick={openUrlModal}>
                    登録済みソースを見る
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Corporate Info Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-[max(0.625rem,env(safe-area-inset-top))] sm:p-3">
          <Card className="flex h-[min(700px,calc(100dvh-1.5rem))] min-h-0 w-full max-w-4xl flex-col overflow-hidden border-border/50">
            {/* Modal header with step indicators */}
            <div className="relative shrink-0 border-b px-4 py-2.5">
              <div className="pr-10">
                <h2 className="text-base font-semibold text-foreground">企業情報を取得</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {companyName} の企業研究ソースを追加します
                </p>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1">
                {(
                  [
                    { key: "configure", label: "1. 条件" },
                    { key: "review", label: "2. 候補" },
                    { key: "result", label: "3. 完了" },
                  ] as Array<{ key: ModalStep; label: string }>
                ).map((step) => {
                  const isActive = activeModalStep === step.key;
                  const isComplete =
                    (step.key === "configure" && activeModalStep !== "configure") ||
                    (step.key === "review" && activeModalStep === "result");
                  const isNavigable = isStepNavigable(step.key);
                  return (
                    <button
                      type="button"
                      key={step.key}
                      onClick={() => handleStepNavigation(step.key)}
                      disabled={!isNavigable}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isActive
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : isComplete
                            ? "border-emerald-200/80 bg-emerald-50 text-emerald-700"
                            : "border-border/60 bg-muted/15 text-muted-foreground",
                        isNavigable
                          ? "cursor-pointer hover:border-primary/20 hover:bg-primary/5 hover:text-foreground"
                          : "cursor-not-allowed opacity-70"
                      )}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="absolute right-3 top-2.5 rounded-full p-1.5 transition-colors hover:bg-background/70"
                disabled={isModalBusy}
              >
                <XIcon />
              </button>
            </div>

            {/* Modal body */}
            <div
              className={cn(
                "flex-1 min-h-0 overflow-hidden transition-opacity duration-200",
                isStepTransitioning ? "opacity-0" : "opacity-100"
              )}
            >
              {displayedStep === "result" && fetchResult && (
                <ResultStep fetchResult={fetchResult} closeModal={closeModal} />
              )}

              {displayedStep !== "result" && (
                <div className="flex h-full min-h-0 flex-col px-3 py-2.5 sm:px-4">
                  {/* Mode tab bar */}
                  <div className="shrink-0 space-y-1.5">
                    <div className="rounded-lg border border-border/50 bg-muted/15 p-0.5">
                      <div className="grid grid-cols-3 gap-0.5">
                        {(
                          [
                            { mode: "web", icon: <GlobeIcon />, label: "Web検索" },
                            { mode: "url", icon: <LinkIcon />, label: "URL指定" },
                            { mode: "pdf", icon: <FileUploadIcon />, label: "資料アップロード" },
                          ] as Array<{ mode: InputMode; icon: React.ReactNode; label: string }>
                        ).map(({ mode, icon, label }) => (
                          <button
                            key={mode}
                            onClick={() => handleModeSwitch(mode)}
                            disabled={isModalBusy}
                            className={cn(
                              "flex min-h-[32px] items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                              inputMode === mode
                                ? "border-primary/20 bg-background text-primary"
                                : "border-transparent text-muted-foreground hover:bg-background/70"
                            )}
                          >
                            {icon}
                            <span className="truncate">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                        <p className="text-xs text-destructive">{error}</p>
                      </div>
                    )}
                  </div>

                  {/* Step content area */}
                  <div
                    className={cn(
                      "mt-2 flex min-h-0 flex-1 flex-col",
                      !showWebReviewStep && "overflow-y-auto overscroll-contain pb-1"
                    )}
                  >
                    {inputMode === "web" && (
                      <WebSearchStep
                        companyName={companyName}
                        webDraft={webDraft}
                        setWebDraft={setWebDraft}
                        isFetching={isFetching}
                        isUploading={isUploading}
                        isSearching={isSearching}
                        isModalBusy={isModalBusy}
                        orderedCandidates={orderedCandidates}
                        allCandidateUrls={allCandidateUrls}
                        resolvedWebContentType={resolvedWebContentType}
                        handleTypeSearch={handleTypeSearch}
                        handleCustomSearch={handleCustomSearch}
                        handleStepNavigation={handleStepNavigation}
                        toggleUrl={toggleUrl}
                        showConfigureStep={showConfigureStep}
                        showWebReviewStep={showWebReviewStep}
                      />
                    )}

                    {showConfigureStep && inputMode === "url" && (
                      <UrlInputStep
                        urlDraft={urlDraft}
                        setUrlDraft={setUrlDraft}
                        parsedCustomUrls={parsedCustomUrls}
                        isFetching={isFetching}
                        isUploading={isUploading}
                      />
                    )}

                    {showConfigureStep && inputMode === "pdf" && (
                      <PdfUploadStep
                        pdfDraft={pdfDraft}
                        setPdfDraft={setPdfDraft}
                        pdfUploadProgress={pdfUploadProgress}
                        pdfPageEstimates={pdfPageEstimates}
                        pdfEstimate={pdfEstimate}
                        pdfEstimateLoading={pdfEstimateLoading}
                        isUploading={isUploading}
                        isFetching={isFetching}
                        isSearching={isSearching}
                        pdfUploadInputId={pdfUploadInputId}
                        ragPdfPolicySummaryJa={ragPdfPolicySummaryJa}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            {!isResultDisplayed && (
              <div className="shrink-0 border-t bg-muted/15 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>登録済みソース</span>
                      <span>{totalSources} / {pageLimit || 0}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${sourceUsagePercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
                    <Button variant="ghost" size="sm" onClick={closeModal} disabled={isModalBusy}>
                      {showWebReviewStep ? "閉じる" : "キャンセル"}
                    </Button>
                    {showWebReviewStep && (
                      <Button
                        size="sm"
                        onClick={handleFetchCorporateInfo}
                        disabled={isFetching || isUploading || webDraft.selectedUrls.length === 0}
                      >
                        {isFetching ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">取得中...</span>
                          </>
                        ) : (
                          "選択したURLを取得"
                        )}
                      </Button>
                    )}
                    {showConfigureStep && inputMode === "url" && (
                      <Button
                        size="sm"
                        onClick={handleFetchCorporateInfo}
                        disabled={
                          isFetching ||
                          isUploading ||
                          parsedCustomUrls.urls.length === 0 ||
                          parsedCustomUrls.invalidLines.length > 0
                        }
                      >
                        {isFetching ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">取得中...</span>
                          </>
                        ) : (
                          "URLから取得"
                        )}
                      </Button>
                    )}
                    {showConfigureStep &&
                      inputMode === "pdf" &&
                      !pdfUploadProgress &&
                      pdfDraft.uploadFiles.length > 0 && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              document.getElementById(pdfUploadInputId)?.click();
                            }}
                            disabled={isUploading}
                          >
                            追加選択
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => { void handleUploadPdf(); }}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <>
                                <LoadingSpinner />
                                <span className="ml-2">取り込み中...</span>
                              </>
                            ) : (
                              `${pdfDraft.uploadFiles.length}件を取り込む`
                            )}
                          </Button>
                        </>
                      )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Registered Sources Modal */}
      {showUrlModal && status?.corporateInfoUrls && (
        <RegisteredSourcesModal
          status={status}
          selectedUrlsForDelete={selectedUrlsForDelete}
          isDeleting={isDeleting}
          deleteError={deleteError}
          toggleUrlForDelete={toggleUrlForDelete}
          toggleSelectAllForDelete={toggleSelectAllForDelete}
          setShowDeleteConfirm={setShowDeleteConfirm}
          closeUrlModal={closeUrlModal}
        />
      )}

      {/* RAG Detail Modal */}
      {showRagModal && ragStatus && (
        <RagDetailModal ragStatus={ragStatus} closeRagModal={closeRagModal} />
      )}

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          selectedCount={selectedUrlsForDelete.size}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteUrls}
        />
      )}
    </>
  );
}
