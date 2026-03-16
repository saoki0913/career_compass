export const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 48;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function getDistanceFromBottom({
  scrollHeight,
  scrollTop,
  clientHeight,
}: ScrollMetrics): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

export function shouldEnableAutoFollow(
  metrics: ScrollMetrics,
  thresholdPx: number = AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
): boolean {
  return getDistanceFromBottom(metrics) <= thresholdPx;
}
