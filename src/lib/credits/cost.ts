import { isLowCostESReviewModel } from "@/lib/ai/es-review-models";

/**
 * Calculate ES review credit cost
 * Low-cost mode:
 *   <=800 chars: 4
 *   <=1600 chars: 6
 *   >1600 chars: 8
 *
 * High-quality modes:
 *   <=800 chars: 10
 *   <=1600 chars: 12
 *   >1600 chars: 16
 */
export function calculateESReviewCost(charCount: number, llmModel?: string | null): number {
  if (isLowCostESReviewModel(llmModel)) {
    if (charCount <= 800) return 4;
    if (charCount <= 1600) return 6;
    return 8;
  }
  if (charCount <= 800) return 10;
  if (charCount <= 1600) return 12;
  return 16;
}
