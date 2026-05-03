"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_META,
  SOURCE_TYPE_META,
  normalizeSourceConfidence,
} from "@/lib/company-info/source-badges";
import { ArrowLeftIcon, GlobeIcon, LoadingSpinner } from "./icons";
import { CONTENT_TYPE_LABELS, FIELD_CLASS } from "./constants";
import { formatCandidateUrl } from "./workflow-helpers";
import {
  CONTENT_TYPE_OPTIONS,
  type ContentType,
  type ModalStep,
  type SearchCandidate,
  type WebDraft,
} from "./workflow-config";

interface WebSearchStepProps {
  companyName: string;
  webDraft: WebDraft;
  setWebDraft: React.Dispatch<React.SetStateAction<WebDraft>>;
  isFetching: boolean;
  isUploading: boolean;
  isSearching: boolean;
  isModalBusy: boolean;
  orderedCandidates: SearchCandidate[];
  allCandidateUrls: string[];
  resolvedWebContentType: ContentType | null;
  handleTypeSearch: (allowSnippetMatch?: boolean) => Promise<void>;
  handleCustomSearch: () => Promise<void>;
  handleStepNavigation: (step: ModalStep) => void;
  toggleUrl: (url: string) => void;
  showConfigureStep: boolean;
  showWebReviewStep: boolean;
}

function CandidateItem({
  candidate,
  isSelected,
  isFetching,
  isUploading,
  toggleUrl,
}: {
  candidate: SearchCandidate;
  isSelected: boolean;
  isFetching: boolean;
  isUploading: boolean;
  toggleUrl: (url: string) => void;
}) {
  const sourceType = candidate.sourceType || "other";
  const confidence = normalizeSourceConfidence(sourceType, candidate.confidence);
  const sourceMeta = SOURCE_TYPE_META[sourceType];
  const confidenceMeta = CONFIDENCE_META[confidence];
  const compactUrl = formatCandidateUrl(candidate.url, 88);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2 transition-colors",
        isSelected ? "bg-primary/5" : "bg-background"
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleUrl(candidate.url)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
        disabled={isFetching || isUploading}
        aria-label={`${candidate.title || compactUrl} を取得対象に追加`}
      />

      <div className="min-w-0 flex-1">
        <a
          href={candidate.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] font-medium text-foreground transition-colors hover:text-primary hover:underline"
          title={candidate.title || compactUrl}
        >
          {candidate.title || compactUrl}
        </a>
        <a
          href={candidate.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline"
          title={candidate.url}
        >
          {compactUrl}
        </a>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              sourceMeta.className
            )}
          >
            {sourceMeta.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              confidenceMeta.className
            )}
          >
            信頼度 {confidenceMeta.label}
          </span>
        </div>
        {candidate.complianceStatus === "blocked" && candidate.complianceReasons?.[0] && (
          <p className="mt-1.5 text-[11px] text-destructive">{candidate.complianceReasons[0]}</p>
        )}
        {candidate.complianceStatus === "warning" && candidate.complianceReasons?.[0] && (
          <p className="mt-1.5 text-[11px] text-amber-700">{candidate.complianceReasons[0]}</p>
        )}
      </div>
    </div>
  );
}

export function WebSearchStep({
  companyName,
  webDraft,
  setWebDraft,
  isFetching,
  isUploading,
  isSearching,
  isModalBusy,
  orderedCandidates,
  allCandidateUrls,
  resolvedWebContentType,
  handleTypeSearch,
  handleCustomSearch,
  handleStepNavigation,
  toggleUrl,
  showConfigureStep,
  showWebReviewStep,
}: WebSearchStepProps) {
  return (
    <>
      {showConfigureStep && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border/60 bg-background/80 p-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">タイプを選択して検索</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  まず候補を探し、必要ならキーワードで絞り込みます。
                </p>
              </div>
              {webDraft.selectedContentType && (
                <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {CONTENT_TYPE_LABELS[webDraft.selectedContentType]}
                </span>
              )}
            </div>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <select
                value={webDraft.selectedContentType || ""}
                onChange={(e) => {
                  const value = e.target.value as ContentType | "";
                  setWebDraft((prev) => ({
                    ...prev,
                    selectedContentType: value || null,
                  }));
                }}
                disabled={isSearching || isFetching || isUploading}
                className={cn(FIELD_CLASS, "h-9 flex-1")}
              >
                <option value="">タイプを選択してください</option>
                {CONTENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => handleTypeSearch()}
                disabled={!webDraft.selectedContentType || isSearching || isFetching || isUploading}
                className="sm:min-w-[104px]"
              >
                {isSearching && webDraft.lastWebSearchKind === "type" ? <LoadingSpinner /> : "検索"}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-sm font-semibold text-foreground">詳細検索</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              欲しいページが決まっている場合だけキーワードを足します。
            </p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={webDraft.searchQuery}
                onChange={(e) =>
                  setWebDraft((prev) => ({
                    ...prev,
                    searchQuery: e.target.value,
                  }))
                }
                placeholder={`例: ${companyName} 社員インタビュー`}
                className={cn(FIELD_CLASS, "h-9 flex-1")}
                disabled={isSearching || isFetching || isUploading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && webDraft.searchQuery.trim()) {
                    void handleCustomSearch();
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => handleCustomSearch()}
                disabled={!webDraft.searchQuery.trim() || isSearching || isFetching || isUploading}
                className="sm:min-w-[104px]"
              >
                {isSearching && webDraft.lastWebSearchKind === "custom" ? <LoadingSpinner /> : "検索"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showWebReviewStep && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleStepNavigation("configure")}
                disabled={isModalBusy}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowLeftIcon />
                条件に戻る
              </button>
              {resolvedWebContentType && (
                <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {CONTENT_TYPE_LABELS[resolvedWebContentType]}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                候補 {orderedCandidates.length}件
              </span>
              <span className="text-[11px] text-muted-foreground">
                選択 {webDraft.selectedUrls.length}件
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setWebDraft((prev) => ({
                    ...prev,
                    selectedUrls: allCandidateUrls,
                  }))
                }
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/20"
                disabled={isFetching || isUploading || allCandidateUrls.length === 0}
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={() =>
                  setWebDraft((prev) => ({
                    ...prev,
                    selectedUrls: [],
                  }))
                }
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                disabled={webDraft.selectedUrls.length === 0 || isFetching || isUploading}
              >
                解除
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-background">
            <div className="h-full overflow-y-auto">
              {orderedCandidates.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {orderedCandidates.map((candidate) => (
                    <CandidateItem
                      key={candidate.url}
                      candidate={candidate}
                      isSelected={webDraft.selectedUrls.includes(candidate.url)}
                      isFetching={isFetching}
                      isUploading={isUploading}
                      toggleUrl={toggleUrl}
                    />
                  ))}
                </div>
              ) : (
                webDraft.hasSearched &&
                !isSearching && (
                  <div className="m-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background text-muted-foreground shadow-sm">
                      <GlobeIcon />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      該当するページが見つかりませんでした
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {webDraft.isRelaxedSearch
                        ? "詳細検索またはURL指定で、対象ページを直接指定してください。"
                        : webDraft.lastWebSearchKind === "custom"
                          ? "キーワードを見直すか、URL指定で対象ページを直接指定してください。"
                          : "条件を緩和するか、詳細検索・URL指定をお試しください。"}
                    </p>
                    {!webDraft.isRelaxedSearch &&
                      webDraft.lastWebSearchKind === "type" &&
                      webDraft.selectedContentType && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTypeSearch(true)}
                          disabled={isSearching || isFetching || isUploading}
                          className="mt-4"
                        >
                          条件を緩和して再検索
                        </Button>
                      )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
