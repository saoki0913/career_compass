"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export function VersionHistory({ documentId, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (e) {
      console.error("Failed to fetch versions:", e);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRestore = async (version: Version) => {
    setIsRestoring(true);
    try {
      onRestore(version.content);
      setPreviewVersion(null);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <LoadingSpinner />
        読み込み中...
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        バージョン履歴はありません
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium px-1 flex items-center gap-2">
        <ClockIcon />
        バージョン履歴
      </h3>
      {versions.map((version) => (
        <Card
          key={version.id}
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setPreviewVersion(version)}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">v{version.version}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {formatDate(version.createdAt)}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(version);
                }}
                disabled={isRestoring}
              >
                復元
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {previewVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold">
                  v{previewVersion.version}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  {formatDate(previewVersion.createdAt)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewVersion(null)}
                >
                  <CloseIcon />
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleRestore(previewVersion)}
                  disabled={isRestoring}
                >
                  {isRestoring ? <LoadingSpinner /> : "この版に復元"}
                </Button>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {previewVersion.content}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
