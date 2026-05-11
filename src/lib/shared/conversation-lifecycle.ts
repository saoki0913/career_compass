import type { PhaseItem } from "@/components/chat";

export type StandardPhaseKey = "questioning" | "draft_ready" | "deep_dive" | "completed";

export const STANDARD_PHASES: ReadonlyArray<{
  readonly key: StandardPhaseKey;
  readonly label: string;
  readonly doneLabel?: string;
}> = [
  { key: "questioning", label: "ヒアリング中" },
  { key: "draft_ready", label: "ES作成可", doneLabel: "ES生成済み" },
  { key: "deep_dive", label: "深掘り中" },
  { key: "completed", label: "完了" },
];

export function computePhaseItems(
  currentPhaseKey: StandardPhaseKey,
  hasDraft?: boolean,
): PhaseItem[] {
  const currentIndex = STANDARD_PHASES.findIndex((p) => p.key === currentPhaseKey);
  return STANDARD_PHASES.map((phase, index) => {
    const status: PhaseItem["status"] =
      index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
    const label =
      phase.doneLabel && hasDraft && (status === "done" || (status === "current" && phase.key === "draft_ready"))
        ? phase.doneLabel
        : phase.label;
    return { key: phase.key, label, status };
  });
}
