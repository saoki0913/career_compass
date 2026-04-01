"use client";

import { cn } from "@/lib/utils";
import {
  BUILD_TRACK_KEYS,
  BUILD_TRACK_LABELS,
  getBuildItemStatus,
  getConversationBadgeLabel,
  getLifecycleItemStatus,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";

interface GakuchikaProgressBarProps {
  state: ConversationState | null;
  status?: "in_progress" | "completed" | null;
  className?: string;
  compact?: boolean;
}

export const STAR_EXPLANATIONS = {
  context: {
    title: "状況",
    description: "いつ・どこで・どんな場面の経験だったか",
    example: "例: 大学3年の春、20人規模の学生団体で広報を担当していた時",
  },
  task: {
    title: "課題",
    description: "何が問題で、なぜ向き合う必要があったか",
    example: "例: イベント参加率が落ちており、継続参加につながっていなかった",
  },
  action: {
    title: "行動",
    description: "自分が実際に取った行動や工夫",
    example: "例: 参加者アンケートを見直し、案内文の導線を再設計した",
  },
  result: {
    title: "結果",
    description: "行動のあとに起きた変化や成果",
    example: "例: 参加率が改善し、定期イベントの継続率が上がった",
  },
} as const;

function statusClass(status: "pending" | "current" | "done") {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "current") return "border-sky-300 bg-sky-50 text-slate-900";
  return "border-border/60 bg-muted/20 text-muted-foreground";
}

function compactStatusClass(status: "pending" | "current" | "done") {
  if (status === "done") return "bg-emerald-500";
  if (status === "current") return "bg-sky-500";
  return "bg-muted-foreground/30";
}

function getLifecycleSteps(state: ConversationState | null) {
  if (!state || state.stage === "es_building") return null;
  return [
    { key: "draft_ready" as const, label: "ES作成可" },
    { key: "deep_dive_active" as const, label: "深掘り中" },
    { key: "interview_ready" as const, label: "面接準備完了" },
  ];
}

export function STARProgressBar({
  state,
  className,
  compact = false,
}: GakuchikaProgressBarProps) {
  const lifecycleSteps = getLifecycleSteps(state);

  if (compact) {
    if (lifecycleSteps) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          {lifecycleSteps.map((step) => {
            const itemStatus = getLifecycleItemStatus(state, step.key);
            return (
              <div key={step.key} className={cn("h-1.5 flex-1 rounded-full", compactStatusClass(itemStatus))} />
            );
          })}
        </div>
      );
    }

    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {BUILD_TRACK_KEYS.map((key) => {
          const itemStatus = getBuildItemStatus(state, key);
          return (
            <div key={key} className={cn("h-1.5 flex-1 rounded-full", compactStatusClass(itemStatus))} />
          );
        })}
      </div>
    );
  }

  if (lifecycleSteps) {
    return (
      <div className={cn("space-y-2", className)}>
        {lifecycleSteps.map((step) => {
          const itemStatus = getLifecycleItemStatus(state, step.key);
          return (
            <div key={step.key} className={cn("rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm", statusClass(itemStatus))}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{step.label}</span>
                <span>{itemStatus === "done" ? "完了" : itemStatus === "current" ? "進行中" : "未着手"}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {BUILD_TRACK_KEYS.map((key) => {
        const itemStatus = getBuildItemStatus(state, key);
        return (
          <div key={key} className={cn("rounded-[18px] border px-3.5 py-2.5 text-xs shadow-sm", statusClass(itemStatus))}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{BUILD_TRACK_LABELS[key]}</span>
              <span>{itemStatus === "done" ? "完了" : itemStatus === "current" ? "進行中" : "未着手"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function STARProgressCompact({
  state,
  status = null,
  className,
}: {
  state: ConversationState | null;
  status?: "in_progress" | "completed" | null;
  className?: string;
}) {
  return <STARProgressBar state={state} status={status} compact className={className} />;
}

export function STARStatusBadge({
  state,
  status = null,
  className,
}: {
  state: ConversationState | null;
  status?: "in_progress" | "completed" | null;
  className?: string;
}) {
  const label = getConversationBadgeLabel(status, state);
  const colorClass =
    label === "面接準備完了"
      ? "bg-emerald-50 text-emerald-700"
      : label === "深掘り中"
      ? "bg-sky-50 text-sky-700"
      : label === "ES作成可"
      ? "bg-amber-50 text-amber-700"
      : label === "作成中"
      ? "bg-sky-50 text-sky-700"
      : "bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", colorClass, className)}>
      {label}
    </span>
  );
}

export type { ConversationState };
