"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Version {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

interface VersionHistoryProps {
  documentId: string;
  onRestore: (content: string) => void;
}

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

function summarizeContent(content: string) {
  try {
    const parsed = JSON.parse(content) as Array<{ content?: string; type?: string }>;
    if (Array.isArray(parsed)) {
      const flatText = parsed
        .map((block) => block.content?.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return flatText || "内容の要約はありません";
    }
  } catch {
    // fall through
  }
  return content.replace(/\s+/g, " ").trim() || "内容の要約はありません";
}

export function VersionHistory({ documentId, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error("Failed to fetch versions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const detailedPreview = useMemo(() => {
    if (!previewVersion) return "";
    return summarizeContent(previewVersion.content);
  }, [previewVersion]);

  const handleRestore = async (version: Version) => {
    const confirmed = window.confirm(`v${version.version} を現在の内容に復元しますか？`);
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      onRestore(version.content);
      setPreviewVersion(null);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <ClockIcon />
          <h3 className="text-sm font-semibold text-foreground">バージョン履歴</h3>
          {versions.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {versions.length}件
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fetchVersions}>
          更新
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <LoadingSpinner />
          読み込み中...
        </div>
      ) : versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          バージョン履歴はまだありません
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((version, index) => {
            const summary = summarizeContent(version.content);
            const reasonLabel = index === 0 ? "最新スナップショット" : "保存スナップショット";
            return (
              <Card key={version.id} className="border-border/80 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">v{version.version}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {reasonLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(version.createdAt)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{summary}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setPreviewVersion(version)}>
                        閲覧
                      </Button>
                      <Button size="sm" className="h-8 px-3 text-xs" disabled={isRestoring} onClick={() => handleRestore(version)}>
                        {isRestoring ? <LoadingSpinner /> : "復元"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewVersion} onOpenChange={(open) => !open && setPreviewVersion(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewVersion ? `v${previewVersion.version} の内容` : "バージョン"}
            </DialogTitle>
          </DialogHeader>
          {previewVersion && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">保存日時: {new Date(previewVersion.createdAt).toLocaleString("ja-JP")}</p>
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-muted/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{detailedPreview}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewVersion(null)}>閉じる</Button>
                <Button disabled={isRestoring} onClick={() => handleRestore(previewVersion)}>
                  {isRestoring ? <LoadingSpinner /> : "この版に復元"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
