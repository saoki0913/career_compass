import type { Page } from "@playwright/test";
import {
  buildSseStream,
  buildProgressEvent,
  buildStringChunkEvents,
  buildFieldCompleteEvent,
  buildCompleteEvent,
  type SseEvent,
  mockSseRoute,
  mockJsonRoute,
} from "./sse-helpers";

export const ES_REVIEW_MOCK_DOC_ID = "es-review-mock-doc";

const REVIEW_RESULT = {
  rewrites: [
    {
      id: "rewrite-1",
      text: "私はチームの課題を整理し、改善施策を実行しました。その結果、業務効率が20%向上しました。",
    },
  ],
  template_review: {
    template: "self_pr",
    overall_score: 78,
    dimension_scores: {
      specificity: 80,
      logic: 75,
      impact: 78,
    },
  },
  review_meta: {
    template: "self_pr",
    grounding_mode: "assistive",
    char_count: 42,
  },
  improvement_explanation:
    "元の文章に具体的な数値と結果を追加し、STAR構造を明確にしました。",
  billing_outcome: { charged: true, credits_used: 1 },
};

export function buildEsReviewStream(opts?: {
  rewriteText?: string;
  result?: Record<string, unknown>;
}): string {
  const rewriteText =
    opts?.rewriteText ??
    "私はチームの課題を整理し、改善施策を実行しました。その結果、業務効率が20%向上しました。";

  const events: SseEvent[] = [
    buildProgressEvent("analysis", 20, "ES を分析中"),
    buildProgressEvent("analysis", 50, "改善ポイントを特定中"),
    ...buildStringChunkEvents("streaming_rewrite", rewriteText),
    buildFieldCompleteEvent("streaming_rewrite", rewriteText),
    buildFieldCompleteEvent(
      "improvement_explanation",
      "元の文章に具体的な数値と結果を追加し、STAR構造を明確にしました。",
    ),
    buildProgressEvent("sources", 80, "参考情報を整理中"),
    buildCompleteEvent(opts?.result ?? REVIEW_RESULT, "result"),
  ];

  return buildSseStream(events);
}

export async function mockEsReviewApis(
  page: Page,
  documentId: string = ES_REVIEW_MOCK_DOC_ID,
): Promise<void> {
  await mockJsonRoute(page, `**/api/documents/${documentId}`, {
    id: documentId,
    title: "自己PR",
    content: "私はリーダーシップを発揮してチームをまとめました。",
    template: "self_pr",
    charCount: 22,
    companyId: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });

  await mockJsonRoute(page, `**/api/documents/${documentId}/versions`, {
    versions: [],
  });

  await mockSseRoute(
    page,
    `**/api/documents/${documentId}/review/stream`,
    buildEsReviewStream(),
  );
}
