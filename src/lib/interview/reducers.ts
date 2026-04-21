/**
 * reducers.ts — Pure reducers for interview SSE `complete` event merging.
 *
 * `useInterviewConversationController` の SSE complete handler から純関数として
 * state マージロジックを抽出したもの。React / SWR / async を介さずに単体テストできる。
 *
 * 副作用 (fetch, setTimeout, setState 呼び出し, ref 操作など) は hook 側に残し、
 * このモジュールは「入力 state + SSE payload -> 新しい state」の変換のみを担う。
 */

import type {
  InterviewPlan,
  InterviewStageStatus,
  InterviewTurnMeta,
  InterviewTurnState,
} from "@/lib/interview/session";
import type { InterviewShortCoaching } from "@/lib/interview/conversation";
import type {
  Feedback,
  FeedbackHistoryItem,
  Message,
  PendingCompleteData,
} from "@/lib/interview/ui";

/**
 * SSE `complete` イベントの種別。hook の `StreamKind` と同じ集合を持つ。
 */
export type InterviewCompleteKind = "start" | "send" | "feedback" | "continue";

/**
 * SSE `complete` event payload の生データ shape。任意フィールドは実装側で fallback する。
 */
export type InterviewCompletePayload = {
  messages?: unknown;
  questionCount?: unknown;
  stageStatus?: unknown;
  questionStage?: unknown;
  focus?: unknown;
  feedback?: unknown;
  questionFlowCompleted?: unknown;
  creditCost?: unknown;
  turnState?: unknown;
  turnMeta?: unknown;
  plan?: unknown;
  feedbackHistories?: unknown;
  // Phase 2 Stage 6: turn SSE のみ含まれる。他 kind では undefined。
  shortCoaching?: unknown;
};

/**
 * Reducer が読み書きする controller state の slice。
 * `useInterviewConversationController` の複数 useState フィールドから該当分のみを抜き出している。
 */
export type InterviewControllerState = {
  messages: Message[];
  questionCount: number;
  stageStatus: InterviewStageStatus | null;
  questionStage: string | null;
  feedback: Feedback | null;
  turnState: InterviewTurnState | null;
  turnMeta: InterviewTurnMeta | null;
  interviewPlan: InterviewPlan | null;
  questionFlowCompleted: boolean;
  creditCost: number;
  feedbackHistories: FeedbackHistoryItem[];
  feedbackCompletionCount: number;
  // Phase 2 Stage 6: 最新 turn の short coaching (null = 非表示 / 初回ターン)。
  // Stage 8 ダッシュボードで履歴との突合表示に使う予定。現状は turn 完了ごとに最新値で上書き。
  shortCoaching: InterviewShortCoaching | null;
};

export type InterviewCompleteMergeOptions = {
  /**
   * complete イベントが `creditCost` を含まないケースで使用する fallback 値。
   * 通常は前 state の creditCost を渡す。
   */
  fallbackCreditCost: number;
  /**
   * feedback kind のとき、最終講評の生成成功を通知カウンタに反映するかどうか。
   * hook 側の `shouldAnnounceFeedbackSuccessRef.current` を渡す想定。
   */
  shouldAnnounceFeedback?: boolean;
};

function parseShortCoachingFromPayload(value: unknown): InterviewShortCoaching | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.good !== "string" ||
    typeof record.missing !== "string" ||
    typeof record.next_edit !== "string"
  ) {
    return null;
  }
  if (!record.good.trim() && !record.missing.trim() && !record.next_edit.trim()) {
    return null;
  }
  return { good: record.good, missing: record.missing, next_edit: record.next_edit };
}

/**
 * SSE `complete` payload を hook が扱いやすい `PendingCompleteData` 形式に正規化する。
 * 空の入力や不正な型はすべて安全な default に fallback させる。
 */
export function parseCompletePayload(
  raw: InterviewCompletePayload | null | undefined,
  fallbackCreditCost: number,
): PendingCompleteData {
  const data = raw ?? {};
  const feedback = (data.feedback as Feedback | null | undefined) ?? null;
  const feedbackHistoriesRaw = data.feedbackHistories;
  return {
    messages: Array.isArray(data.messages) ? (data.messages as Message[]) : [],
    questionCount: typeof data.questionCount === "number" ? data.questionCount : 0,
    stageStatus: (data.stageStatus as InterviewStageStatus | null | undefined) || null,
    questionStage: typeof data.questionStage === "string" ? data.questionStage : null,
    focus: typeof data.focus === "string" ? data.focus : null,
    feedback,
    questionFlowCompleted: Boolean(data.questionFlowCompleted) || Boolean(feedback),
    creditCost: typeof data.creditCost === "number" ? data.creditCost : fallbackCreditCost,
    turnState: (data.turnState as InterviewTurnState | null | undefined) ?? null,
    turnMeta: (data.turnMeta as InterviewTurnMeta | null | undefined) ?? null,
    plan: (data.plan as InterviewPlan | null | undefined) ?? null,
    feedbackHistories: Array.isArray(feedbackHistoriesRaw)
      ? (feedbackHistoriesRaw as FeedbackHistoryItem[])
      : undefined,
    shortCoaching: parseShortCoachingFromPayload(data.shortCoaching),
  };
}

/**
 * `complete` event の全 kind 共通 merge ロジック。
 *
 * - 通常フィールドは payload を一方向上書きする
 * - `feedbackHistories` は payload にあるときだけ差し替える
 * - `feedbackCompletionCount` は kind === "feedback" かつ feedback が付与された場合のみ +1
 *   (shouldAnnounceFeedback が false の場合は +1 しない = 講評を UI 表示しない場面の抑止)
 */
export function mergeCompletePayload(
  prev: InterviewControllerState,
  payload: InterviewCompletePayload | null | undefined,
  kind: InterviewCompleteKind,
  options: InterviewCompleteMergeOptions,
): InterviewControllerState {
  const completeData = parseCompletePayload(payload, options.fallbackCreditCost);

  const nextFeedbackHistories = completeData.feedbackHistories
    ? completeData.feedbackHistories
    : prev.feedbackHistories;

  const shouldIncrementFeedback =
    kind === "feedback" &&
    Boolean(completeData.feedback) &&
    options.shouldAnnounceFeedback === true;

  // Phase 2 Stage 6: short coaching は turn 完了時のみ payload に入る想定。
  // start / feedback / continue のときは completeData.shortCoaching が null になり、
  // 直前の turn coaching を勝手に消さないよう prev の値を保持する。
  // 明示的に新しい値が届いた kind (= send/turn) のときのみ上書き。
  const nextShortCoaching: InterviewShortCoaching | null =
    kind === "send"
      ? (completeData.shortCoaching ?? null)
      : prev.shortCoaching;

  return {
    messages: completeData.messages,
    questionCount: completeData.questionCount,
    stageStatus: completeData.stageStatus,
    questionStage: completeData.questionStage,
    feedback: completeData.feedback,
    turnState: completeData.turnState,
    turnMeta: completeData.turnMeta ?? null,
    interviewPlan: completeData.plan ?? null,
    questionFlowCompleted: completeData.questionFlowCompleted,
    creditCost: completeData.creditCost,
    feedbackHistories: nextFeedbackHistories,
    feedbackCompletionCount: shouldIncrementFeedback
      ? prev.feedbackCompletionCount + 1
      : prev.feedbackCompletionCount,
    shortCoaching: nextShortCoaching,
  };
}

/**
 * 面接開始 (start) 完了時の state merge。
 */
export function mergeStartCompletePayload(
  prev: InterviewControllerState,
  payload: InterviewCompletePayload | null | undefined,
  options: InterviewCompleteMergeOptions,
): InterviewControllerState {
  return mergeCompletePayload(prev, payload, "start", options);
}

/**
 * 回答送信 (send / turn) 完了時の state merge。
 */
export function mergeTurnCompletePayload(
  prev: InterviewControllerState,
  payload: InterviewCompletePayload | null | undefined,
  options: InterviewCompleteMergeOptions,
): InterviewControllerState {
  return mergeCompletePayload(prev, payload, "send", options);
}

/**
 * 追加質問 (continue) 完了時の state merge。
 */
export function mergeContinueCompletePayload(
  prev: InterviewControllerState,
  payload: InterviewCompletePayload | null | undefined,
  options: InterviewCompleteMergeOptions,
): InterviewControllerState {
  return mergeCompletePayload(prev, payload, "continue", options);
}

/**
 * 最終講評 (feedback) 完了時の state merge。
 * `shouldAnnounceFeedback: true` のときのみ `feedbackCompletionCount` を加算する。
 */
export function mergeFeedbackCompletePayload(
  prev: InterviewControllerState,
  payload: InterviewCompletePayload | null | undefined,
  options: InterviewCompleteMergeOptions,
): InterviewControllerState {
  return mergeCompletePayload(prev, payload, "feedback", options);
}
