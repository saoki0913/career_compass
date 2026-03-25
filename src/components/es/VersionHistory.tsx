"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  /** When true, restore actions are disabled (e.g. during AI review stream). */
  restoreDisabled?: boolean;
}

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

function buildCompareHint(selectedSummary: string, newerSummary: string | null) {
  if (!newerSummary) {
    return "ひとつ新しい版はありません（この版が一覧上もっとも新しい保存です）。";
  }
  const lenA = selectedSummary.length;
  const lenB = newerSummary.length;
  const delta = lenB - lenA;
  const deltaLabel =
    delta === 0 ? "文字数は同程度です。" : `文字数の差は約 ${delta > 0 ? "+" : ""}${delta} 文字です。`;
  const headA = selectedSummary.slice(0, 120);
  const headB = newerSummary.slice(0, 120);
  const sameHead = headA === headB;
  return `${deltaLabel}${sameHead ? " 先頭付近の文言は同じです。" : " 先頭付近の文言が異なります。"}`;
}

export function VersionHistory({ documentId, onRestore, restoreDisabled = false }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Version | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

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

  const previewIndex = useMemo(() => {
    if (!previewVersion) return -1;
    return versions.findIndex((v) => v.id === previewVersion.id);
  }, [previewVersion, versions]);

  const newerAdjacentSummary = useMemo(() => {
    if (previewIndex <= 0) return null;
    return summarizeContent(versions[previewIndex - 1]!.content);
  }, [previewIndex, versions]);

  const compareHint = useMemo(() => {
    if (!previewVersion) return "";
    return buildCompareHint(detailedPreview, newerAdjacentSummary);
  }, [detailedPreview, newerAdjacentSummary, previewVersion]);

  const runRestore = async (version: Version) => {
    if (restoreDisabled) return;
    setIsRestoring(true);
    try {
      onRestore(version.content);
      setPreviewVersion(null);
      setRestoreTarget(null);
    } finally {
      setIsRestoring(false);
    }
  };

  const requestRestore = (version: Version, options?: { closePreview?: boolean }) => {
    if (restoreDisabled) return;
    if (options?.closePreview) {
      setPreviewVersion(null);
    }
    setRestoreTarget(version);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-semibold text-foreground hover:bg-muted/50"
        aria-expanded={panelOpen}
      >
        <span className="flex items-center gap-2">
          バージョン履歴
          {versions.length > 0 ? (
            <span className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
              {versions.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", panelOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {panelOpen ? (
        <div className="space-y-1">
          <div className="flex justify-end px-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fetchVersions}>
              更新
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              <LoadingSpinner />
              読み込み中...
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
              バージョン履歴はまだありません
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5 p-0.5">
              {versions.map((version, index) => {
                const summary = summarizeContent(version.content);
                const isSelected = previewVersion?.id === version.id;
                const titlePrimary =
                  index === 0
                    ? `バージョン ${version.version}（いまの編集のもとになる版）`
                    : `バージョン ${version.version}`;
                const titleSecondary =
                  index === 0
                    ? formatRelativeTime(version.createdAt)
                    : `過去の自動保存 · ${formatRelativeTime(version.createdAt)}`;
                return (
                  <li key={version.id}>
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-2 py-2 transition-colors",
                        isSelected ? "bg-muted/60" : "hover:bg-muted/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-foreground">{titlePrimary}</span>
                          {index === 0 ? (
                            <span className="text-xs text-muted-foreground">{titleSecondary}</span>
                          ) : null}
                        </div>
                        {index !== 0 ? (
                          <p className="text-xs text-muted-foreground">{titleSecondary}</p>
                        ) : null}
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{summary}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => setPreviewVersion(version)}
                        >
                          閲覧
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={isRestoring || restoreDisabled}
                          onClick={() => requestRestore(version)}
                        >
                          復元
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この版に復元しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget
                ? `バージョン ${restoreTarget.version} の内容で、いまのエディタを置き換えます。未保存の変更は失われることがあります。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring || restoreDisabled || !restoreTarget}
              onClick={(e) => {
                e.preventDefault();
                if (restoreTarget) void runRestore(restoreTarget);
              }}
            >
              {isRestoring ? <LoadingSpinner /> : "復元する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewVersion} onOpenChange={(open) => !open && setPreviewVersion(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewVersion ? `バージョン ${previewVersion.version}` : "バージョン"}
            </DialogTitle>
          </DialogHeader>
          {previewVersion && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                保存日時: {new Date(previewVersion.createdAt).toLocaleString("ja-JP")}
              </p>

              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground">ひとつ新しい版との比較（目安）</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{compareHint}</p>
                {previewIndex > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        閲覧中の版
                      </p>
                      <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">{detailedPreview}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        ひとつ新しい版
                      </p>
                      <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
                        {newerAdjacentSummary ?? "—"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{detailedPreview}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewVersion(null)}>
                  閉じる
                </Button>
                <Button
                  disabled={isRestoring || restoreDisabled}
                  onClick={() => {
                    requestRestore(previewVersion, { closePreview: true });
                  }}
                >
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
