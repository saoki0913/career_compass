/**
 * Calculate ES review credit cost
 * Formula: max(2, ceil(charCount / 800)), max 5
 * Minimum 2 credits to ensure profitability on short ES reviews
 */
export function calculateESReviewCost(charCount: number): number {
  return Math.min(5, Math.max(2, Math.ceil(charCount / 800)));
}
