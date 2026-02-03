"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * CollapsibleVersionHistory Component
 *
 * A collapsible wrapper for version history with:
 * - Expandable/collapsible header
 * - Version count badge
 * - Hover preview for version content
 * - Relative timestamps
 * - Smooth animations via framer-motion
 *
 * UX Psychology: Progressive Disclosure
 * - Collapsed by default to reduce cognitive load
 * - Version count visible even when collapsed
 */

interface Version {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

interface CollapsibleVersionHistoryProps {
  documentId: string;
  onRestore: (content: string) => void;
  defaultExpanded?: boolean;
  storageKey?: string; // Key for localStorage persistence
  className?: string;
}

// Icons
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronIcon = ({ isExpanded }: { isExpanded: boolean }) => (
  <svg
    className={cn(
      "w-4 h-4 transition-transform duration-200",
      isExpanded ? "rotate-180" : ""
    )}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

export function CollapsibleVersionHistory({
  documentId,
  onRestore,
  defaultExpanded = false,
  storageKey,
  className,
}: CollapsibleVersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hoveredVersionId, setHoveredVersionId] = useState<string | null>(null);

  // Persistence-aware expanded state
  const [isExpanded, setIsExpanded] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`version-history-${storageKey}`);
      return saved ? saved === "true" : defaultExpanded;
    }
    return defaultExpanded;
  });

  // Save expanded state to localStorage
  useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`version-history-${storageKey}`, String(isExpanded));
    }
  }, [isExpanded, storageKey]);

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

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  // Get hovered version for inline preview
  const hoveredVersion = versions.find((v) => v.id === hoveredVersionId);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header - always visible */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="version-history-content"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon />
          <span>バージョン履歴</span>
          {versions.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">
              {versions.length}件
            </span>
          )}
        </div>
        <ChevronIcon isExpanded={isExpanded} />
      </button>

      {/* Content - collapsible */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id="version-history-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-1">
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <LoadingSpinner />
                  読み込み中...
                </div>
              ) : versions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  バージョン履歴はありません
                </div>
              ) : (
                <>
                  {/* Version list */}
                  {versions.slice(0, 5).map((version) => (
                    <Card
                      key={version.id}
                      className={cn(
                        "cursor-pointer transition-all duration-200",
                        hoveredVersionId === version.id
                          ? "bg-muted/70 shadow-sm"
                          : "hover:bg-muted/50"
                      )}
                      onMouseEnter={() => setHoveredVersionId(version.id)}
                      onMouseLeave={() => setHoveredVersionId(null)}
                      onClick={() => setPreviewVersion(version)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">v{version.version}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(version.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewVersion(version);
                              }}
                              title="プレビュー"
                            >
                              <EyeIcon />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(version);
                              }}
                              disabled={isRestoring}
                            >
                              復元
                            </Button>
                          </div>
                        </div>

                        {/* Inline preview on hover */}
                        <AnimatePresence>
                          {hoveredVersionId === version.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <p className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground line-clamp-2">
                                {version.content.substring(0, 150)}
                                {version.content.length > 150 && "..."}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Show more indicator */}
                  {versions.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      +{versions.length - 5}件のバージョン
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      {previewVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold">v{previewVersion.version}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {formatRelativeTime(previewVersion.createdAt)}
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

export default CollapsibleVersionHistory;
