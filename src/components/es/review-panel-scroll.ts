export interface ReviewPanelIssueLike {
  issue: string;
  suggestion: string;
  why_now?: string;
}

export interface ReviewPanelSourceLike {
  excerpt?: string;
}

export function getVisibleReviewContentSize({
  rewriteText,
  issues,
  sources,
}: {
  rewriteText: string;
  issues: ReviewPanelIssueLike[];
  sources: ReviewPanelSourceLike[];
}): number {
  const issuesSize = issues.reduce(
    (total, issue) => total + issue.issue.length + issue.suggestion.length + (issue.why_now?.length ?? 0),
    0,
  );
  const sourcesSize = sources.reduce((total, source) => total + (source.excerpt?.length ?? 0), 0);

  return rewriteText.length + issuesSize + sourcesSize;
}

export function shouldAutoScrollToLatest({
  hasVisibleResults,
  previousSize,
  nextSize,
}: {
  hasVisibleResults: boolean;
  previousSize: number;
  nextSize: number;
}): boolean {
  return hasVisibleResults && nextSize > previousSize;
}
