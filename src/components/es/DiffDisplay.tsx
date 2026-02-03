"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { computeDiff, getDiffStats, type DiffSegment } from "@/lib/diff";

/**
 * DiffDisplay Component
 *
 * Displays the difference between original and new text.
 * Supports inline mode (interleaved additions/deletions).
 *
 * UX Psychology: Recognition over Recall
 * - Red background for removed text (with strikethrough)
 * - Green background for added text
 * - Clear visual distinction reduces cognitive load
 */

interface DiffDisplayProps {
  originalText: string;
  newText: string;
  className?: string;
  showStats?: boolean;
}

function DiffSegmentDisplay({ segment }: { segment: DiffSegment }) {
  switch (segment.type) {
    case "removed":
      return (
        <span
          className="bg-red-100 text-red-800 line-through decoration-red-500/50 px-0.5 rounded-sm"
          title="削除"
        >
          {segment.text}
        </span>
      );
    case "added":
      return (
        <span
          className="bg-emerald-100 text-emerald-800 px-0.5 rounded-sm"
          title="追加"
        >
          {segment.text}
        </span>
      );
    case "unchanged":
    default:
      return <span>{segment.text}</span>;
  }
}

export function DiffDisplay({
  originalText,
  newText,
  className,
  showStats = true,
}: DiffDisplayProps) {
  // Memoize diff computation for performance
  const segments = useMemo(
    () => computeDiff(originalText, newText),
    [originalText, newText]
  );

  const stats = useMemo(
    () => getDiffStats(segments),
    [segments]
  );

  // If texts are identical, show simple message
  if (originalText === newText) {
    return (
      <div className={cn("text-sm text-muted-foreground italic", className)}>
        変更なし
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200" />
          <span className="text-muted-foreground">削除</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200" />
          <span className="text-muted-foreground">追加</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="p-4 bg-muted/30 rounded-lg border border-border">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {segments.map((segment, index) => (
            <DiffSegmentDisplay key={index} segment={segment} />
          ))}
        </p>
      </div>

      {/* Stats */}
      {showStats && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {stats.removedChars > 0 && (
            <span className="text-red-600">
              -{stats.removedChars}文字
            </span>
          )}
          {stats.addedChars > 0 && (
            <span className="text-emerald-600">
              +{stats.addedChars}文字
            </span>
          )}
          <span>
            変更率: {stats.changePercentage}%
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline diff for use within other components
 */
export function InlineDiff({
  originalText,
  newText,
  className,
}: Omit<DiffDisplayProps, "showStats">) {
  const segments = useMemo(
    () => computeDiff(originalText, newText),
    [originalText, newText]
  );

  if (originalText === newText) {
    return <span className={className}>{originalText}</span>;
  }

  return (
    <span className={cn("inline", className)}>
      {segments.map((segment, index) => (
        <DiffSegmentDisplay key={index} segment={segment} />
      ))}
    </span>
  );
}

export default DiffDisplay;
