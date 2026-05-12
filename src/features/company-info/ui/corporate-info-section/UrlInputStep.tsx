"use client";

import { useEffect, useMemo } from "react";
import { detectContentTypeFromUrl } from "@/lib/company-info/sources";
import { cn } from "@/lib/utils";
import { CONTENT_TYPE_OPTIONS, type ContentType, type UrlDraft } from "./workflow-config";

interface ParsedCustomUrls {
  urls: string[];
  invalidLines: Array<{ lineNumber: number; value: string }>;
  totalLines: number;
}

interface UrlInputStepProps {
  urlDraft: UrlDraft;
  setUrlDraft: (draft: UrlDraft) => void;
  parsedCustomUrls: ParsedCustomUrls;
  isFetching: boolean;
  isUploading: boolean;
}

export function UrlInputStep({
  urlDraft,
  setUrlDraft,
  parsedCustomUrls,
  isFetching,
  isUploading,
}: UrlInputStepProps) {
  const detectedContentType = useMemo<ContentType | null>(() => {
    if (parsedCustomUrls.urls.length === 0) return null;
    const detectedTypes = parsedCustomUrls.urls.map((url) => detectContentTypeFromUrl(url));
    const [firstType] = detectedTypes;
    if (!firstType) return null;
    return detectedTypes.every((type) => type === firstType) ? firstType : null;
  }, [parsedCustomUrls.urls]);

  useEffect(() => {
    setUrlDraft({
      customUrlInput: urlDraft.customUrlInput,
      contentType: detectedContentType,
    });
  }, [detectedContentType, setUrlDraft, urlDraft.customUrlInput]);

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-background/80 p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">URL</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          1行に1つずつ入力すると、複数ページをまとめて取得できます。
        </p>
      </div>

      <textarea
        value={urlDraft.customUrlInput}
        onChange={(e) =>
          setUrlDraft({
            customUrlInput: e.target.value,
            contentType: urlDraft.contentType,
          })
        }
        placeholder={"https://example.com/recruit\nhttps://example.com/company\nhttps://example.com/ir"}
        className={cn(
          "h-[124px] w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 transition-colors",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        )}
        disabled={isFetching || isUploading}
        spellCheck={false}
      />

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">コンテンツ種別</span>
        <select
          value={urlDraft.contentType ?? ""}
          onChange={(e) =>
            setUrlDraft({
              customUrlInput: urlDraft.customUrlInput,
              contentType: e.target.value ? (e.target.value as ContentType) : null,
            })
          }
          className={cn(
            "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors",
            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
          )}
          disabled={isFetching || isUploading}
        >
          <option value="">自動推定 (URLから判定)</option>
          {CONTENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
          有効なURL {parsedCustomUrls.urls.length}件
        </span>
        {parsedCustomUrls.invalidLines.length > 0 && (
          <span className="rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-destructive">
            無効な行 {parsedCustomUrls.invalidLines.length}件
          </span>
        )}
        {parsedCustomUrls.totalLines > parsedCustomUrls.urls.length &&
          parsedCustomUrls.invalidLines.length === 0 && (
            <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
              重複は自動でまとめます
            </span>
          )}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
        `http://` または `https://` から始まるURLを入力してください。
      </div>
    </div>
  );
}
