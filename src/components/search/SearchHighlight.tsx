/**
 * SearchHighlight Component
 *
 * Highlights matching text within a string
 */

"use client";

import { useMemo } from "react";

interface SearchHighlightProps {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
}

export function SearchHighlight({
  text,
  query,
  className = "",
  highlightClassName = "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 rounded-sm px-0.5",
}: SearchHighlightProps) {
  const parts = useMemo(() => {
    if (!query || query.trim().length === 0) {
      return [{ text, highlight: false }];
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    const result: { text: string; highlight: boolean }[] = [];

    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery);

    while (index !== -1) {
      // Add non-matching part
      if (index > lastIndex) {
        result.push({
          text: text.slice(lastIndex, index),
          highlight: false,
        });
      }

      // Add matching part
      result.push({
        text: text.slice(index, index + query.length),
        highlight: true,
      });

      lastIndex = index + query.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push({
        text: text.slice(lastIndex),
        highlight: false,
      });
    }

    return result;
  }, [text, query]);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className={highlightClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
