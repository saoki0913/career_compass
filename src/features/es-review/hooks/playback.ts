import type { ReviewPlaybackPhase, ReviewResult, TemplateSource, VisibleTemplateSource } from "./types";

export interface ReceivedReviewState {
  keywordSources: TemplateSource[];
  rewriteText: string;
  explanationText: string;
  explanationComplete: boolean;
}

interface PlaybackReviewState {
  visibleRewriteText: string;
  visibleExplanationText: string;
  visibleSources: VisibleTemplateSource[];
}

export const EMPTY_RECEIVED_REVIEW: ReceivedReviewState = {
  keywordSources: [],
  rewriteText: "",
  explanationText: "",
  explanationComplete: false,
};

export const EMPTY_PLAYBACK_REVIEW: PlaybackReviewState = {
  visibleRewriteText: "",
  visibleExplanationText: "",
  visibleSources: [],
};

export function mergeStreamedItems<T>(streamedItems: T[], finalItems: T[]): T[] {
  if (streamedItems.length === 0) {
    return finalItems;
  }

  if (finalItems.length === 0) {
    return streamedItems;
  }

  const nextItems = [...streamedItems];
  for (let index = streamedItems.length; index < finalItems.length; index += 1) {
    nextItems[index] = finalItems[index];
  }
  return nextItems;
}

export function upsertStreamItem<T>(items: T[], path: string, value: T): T[] {
  const index = Number.parseInt(path.split(".").at(-1) ?? "", 10);
  if (!Number.isFinite(index) || index < 0) {
    return [...items, value];
  }

  const nextItems = [...items];
  nextItems[index] = value;
  return nextItems.filter((item): item is T => item !== undefined);
}

export function getRewriteCadence(targetText: string, currentLength: number) {
  const remaining = targetText.length - currentLength;
  const nextChunk = targetText.slice(currentLength, currentLength + 6);
  const hasHardPause = /[。！？]/.test(nextChunk);
  const hasSoftPause = /[、，：]/.test(nextChunk);

  return {
    step: remaining > 220 ? 8 : remaining > 120 ? 6 : 3,
    delay: hasHardPause ? 110 : hasSoftPause ? 78 : 48,
  };
}

export function getReduceMotionPreference() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isVisibleSourceSettled(visible: VisibleTemplateSource, target: TemplateSource): boolean {
  return (visible.excerpt ?? "") === (target.excerpt ?? "");
}

export function derivePlaybackPhase(
  review: ReviewResult | null,
  playback: PlaybackReviewState,
  received: ReceivedReviewState,
  isLoading: boolean,
): ReviewPlaybackPhase {
  const hasVisibleContent =
    playback.visibleRewriteText.length > 0 || playback.visibleSources.length > 0;

  if (!isLoading && !review && !hasVisibleContent) {
    return "idle";
  }

  if (
    isLoading ||
    playback.visibleRewriteText.length < received.rewriteText.length ||
    (received.rewriteText.length === 0 && !review)
  ) {
    return "rewrite";
  }

  const sourcesSettled =
    playback.visibleSources.length >= received.keywordSources.length &&
    playback.visibleSources.every((source, index) => {
      const targetSource = received.keywordSources[index];
      return targetSource ? isVisibleSourceSettled(source, targetSource) : true;
    });

  if (!sourcesSettled) {
    return "sources";
  }

  return review ? "complete" : "sources";
}

export function createVisibleSource(source: TemplateSource): VisibleTemplateSource {
  return {
    ...source,
    excerpt: "",
    isSettled: !(source.excerpt ?? "").length,
  };
}

export function getSourcePlaybackStage(visible: VisibleTemplateSource, target: TemplateSource) {
  const targetValue = target.excerpt ?? "";
  const currentValue = visible.excerpt ?? "";

  if (currentValue.length < targetValue.length) {
    return {
      key: "excerpt" as const,
      currentValue,
      targetValue,
    };
  }

  return null;
}
