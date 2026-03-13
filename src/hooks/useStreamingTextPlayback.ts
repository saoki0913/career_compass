"use client";

import { useEffect, useState } from "react";

interface UseStreamingTextPlaybackOptions {
  isActive: boolean;
  resetKey?: string | number;
}

function getChunkSize(remaining: string, displayedLength: number): number {
  if (displayedLength < 10) return 2;
  if (/^[A-Za-z0-9]/.test(remaining)) return 2;
  return 1;
}

function getDelay(nextChunk: string, displayedLength: number): number {
  const lastChar = nextChunk.slice(-1);
  if (lastChar === "。" || lastChar === "！" || lastChar === "？") return 120;
  if (lastChar === "、" || lastChar === ",") return 72;
  if (displayedLength < 10) return 20;
  return 32;
}

export function useStreamingTextPlayback(
  targetText: string,
  { isActive, resetKey }: UseStreamingTextPlaybackOptions,
) {
  const [playbackState, setPlaybackState] = useState({
    resetKey,
    text: "",
  });

  const displayedText = !targetText
    ? ""
    : !isActive
      ? targetText
      : playbackState.resetKey !== resetKey
        ? ""
        : playbackState.text;

  useEffect(() => {
    if (!isActive) return;
    if (displayedText === targetText) return;

    const remaining = targetText.slice(displayedText.length);
    if (!remaining) return;

    const chunkSize = getChunkSize(remaining, displayedText.length);
    const nextChunk = remaining.slice(0, chunkSize);
    const delay = getDelay(nextChunk, displayedText.length);
    const timer = window.setTimeout(() => {
      setPlaybackState({
        resetKey,
        text: displayedText + nextChunk,
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [displayedText, isActive, resetKey, targetText]);

  return {
    displayedText,
    isPlaybackComplete: displayedText === targetText,
  };
}
