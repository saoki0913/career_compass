import type { PhaseItem } from "@/components/chat";

export type StandardPhaseKey = "questioning" | "draft_ready" | "deep_dive" | "completed";

export interface PhaseDef {
  readonly key: string;
  readonly label: string;
  readonly doneLabel?: string;
}

export const STANDARD_PHASES: ReadonlyArray<PhaseDef> = [
  { key: "questioning", label: "ヒアリング中" },
  { key: "draft_ready", label: "ES作成可", doneLabel: "ES生成済み" },
  { key: "deep_dive", label: "深掘り中" },
  { key: "completed", label: "完了" },
];

/**
 * フェーズ列と現在位置 (currentIndex) から `PhaseItem[]` を組み立てる汎用ロジック。
 *
 * - `currentIndex` より前は `done`、一致は `current`、後は `pending`。
 * - `isTerminal` が true のとき、終端フェーズ (最後の要素) を `current` ではなく `done` に倒す。
 *   完了状態で最終フェーズに「進行中」バッジが出る不具合を防ぐ。
 * - `doneLabel` は draft 生成済み (`hasDraft`) かつ done、または draft フェーズが current の場合に適用する。
 */
export function computePhaseItemsFrom(
  phases: ReadonlyArray<PhaseDef>,
  currentIndex: number,
  options?: { hasDraft?: boolean; isTerminal?: boolean; draftLabelKey?: string },
): PhaseItem[] {
  const isTerminal = options?.isTerminal ?? false;
  const draftKey = options?.draftLabelKey ?? "draft_ready";
  return phases.map((phase, index) => {
    let status: PhaseItem["status"] =
      index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
    if (isTerminal && index === phases.length - 1) status = "done";
    const label =
      phase.doneLabel &&
      options?.hasDraft &&
      (status === "done" || (status === "current" && phase.key === draftKey))
        ? phase.doneLabel
        : phase.label;
    return { key: phase.key, label, status };
  });
}

export function computePhaseItems(
  currentPhaseKey: StandardPhaseKey,
  hasDraft?: boolean,
): PhaseItem[] {
  const currentIndex = STANDARD_PHASES.findIndex((p) => p.key === currentPhaseKey);
  return computePhaseItemsFrom(STANDARD_PHASES, currentIndex, {
    hasDraft,
    isTerminal: currentPhaseKey === "completed",
  });
}

export const INTERVIEW_PHASES: ReadonlyArray<PhaseDef> = [
  { key: "setup", label: "面接設定" },
  { key: "questions", label: "質問フェーズ" },
  { key: "feedback", label: "まとめシート" },
  { key: "complete", label: "面接完了" },
];

export type InterviewPhaseKey = "setup" | "questions" | "feedback" | "complete";

export function resolveInterviewPhaseIndex(input: {
  hasStarted: boolean;
  questionFlowCompleted: boolean;
  hasFeedback: boolean;
}): { index: number; isTerminal: boolean } {
  if (input.hasFeedback) return { index: 3, isTerminal: true };
  if (input.questionFlowCompleted) return { index: 2, isTerminal: false };
  if (input.hasStarted) return { index: 1, isTerminal: false };
  return { index: 0, isTerminal: false };
}

export function computeInterviewPhaseItems(input: {
  hasStarted: boolean;
  questionFlowCompleted: boolean;
  hasFeedback: boolean;
}): PhaseItem[] {
  const { index, isTerminal } = resolveInterviewPhaseIndex(input);
  return computePhaseItemsFrom(INTERVIEW_PHASES, index, { isTerminal });
}
