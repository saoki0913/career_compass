import type { ProcessingStep } from "@/components/ui/EnhancedProcessingSteps";

const DEFAULT_SSE_STEPS: ProcessingStep[] = [
  { id: "validation", label: "入力内容を確認中...", subLabel: "設問と条件をチェック", duration: 1000 },
  { id: "rag_fetch", label: "企業情報を取得中...", subLabel: "関連情報を絞り込んでいます", duration: 8000 },
  { id: "analysis", label: "設問を分析中...", subLabel: "回答の土台を整えています", duration: 10000 },
  { id: "rewrite", label: "改善案を作成中...", subLabel: "伝わり方を整えています", duration: 8000 },
  { id: "sources", label: "出典リンクを整理しています...", subLabel: "関連情報を最後に添えています", duration: 2000 },
];

export function createSSESteps(): ProcessingStep[] {
  return DEFAULT_SSE_STEPS.map((step) => ({ ...step }));
}
