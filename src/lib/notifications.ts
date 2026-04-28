import { enqueueSnackbar, type SnackbarTone } from "@/lib/snackbar-store";

export type { SnackbarTone };

type NotificationArgs = {
  title: string;
  description?: string;
  duration?: number;
};

const DEFAULT_DURATION = 3600;
const ERROR_DURATION = 5200;

export function notifySnackbar(
  tone: SnackbarTone,
  { title, description, duration }: NotificationArgs,
) {
  enqueueSnackbar({
    tone,
    title,
    description,
    duration: duration ?? (tone === "error" ? ERROR_DURATION : DEFAULT_DURATION),
  });
}

export function notifySuccess({ title, description, duration = DEFAULT_DURATION }: NotificationArgs) {
  enqueueSnackbar({ tone: "success", title, description, duration });
}

export function notifyError({ title, description, duration = ERROR_DURATION }: NotificationArgs) {
  enqueueSnackbar({ tone: "error", title, description, duration });
}

export function notifyInfo({ title, description, duration = DEFAULT_DURATION }: NotificationArgs) {
  enqueueSnackbar({ tone: "info", title, description, duration });
}

/** 単文のニュートラル通知（旧 toast.message 相当） */
export function notifyMessage(message: string, duration = DEFAULT_DURATION) {
  enqueueSnackbar({ tone: "info", title: message, duration });
}

export function notifyReviewSuccess(hasCompanyContext: boolean) {
  return notifySuccess({
    title: "添削が完了しました",
    description: hasCompanyContext
      ? "企業情報を踏まえた改善案、改善ポイント、出典リンクを表示しました"
      : "改善案、改善ポイント、出典リンクを表示しました",
    duration: 4200,
  });
}

export function notifyReviewError({
  message,
  action,
}: {
  message: string;
  action?: string | null;
}) {
  return notifyError({
    title: message,
    description: action || undefined,
  });
}

export function notifyOperationLocked() {
  return notifyInfo({
    title: "他の処理を実行中です。",
    description: "完了後にもう一度お試しください。",
  });
}

export function notifyRateLimit(seconds: number) {
  return notifyError({
    title: "利用回数の上限に達しました",
    description: `${seconds}秒後に再試行できます`,
    duration: Math.min(seconds * 1000, 10000),
  });
}

export function notifyMotivationDraftReady() {
  return notifySuccess({
    title: "志望動機ESを作成できる状態になりました",
    description: "右上の「志望動機ESを作成」から生成できます。会話はそのまま続けられます。",
    duration: 4200,
  });
}

export function notifyMotivationDraftGenerated() {
  return notifySuccess({
    title: "ESを生成しました",
    duration: 4200,
  });
}

export function notifyMotivationDraftSaved() {
  return notifySuccess({
    title: "ESとして保存しました",
    duration: 4200,
  });
}

export function notifyGakuchikaDraftGenerated() {
  return notifySuccess({
    title: "ESを生成しました",
    duration: 4200,
  });
}

export function notifyGakuchikaDraftSaved() {
  return notifySuccess({
    title: "ESを開きます",
    duration: 4200,
  });
}

export function notifyGakuchikaInterviewReady() {
  return notifySuccess({
    title: "面接準備が完了しました",
    description: "必要なタイミングでフィードバックを表示できます。",
    duration: 4200,
  });
}

export function notifyTaskCreated() {
  return notifySuccess({ title: "タスクを追加しました" });
}

export function notifyTaskSaved() {
  return notifySuccess({ title: "タスクを保存しました" });
}

export function notifyTaskStatusChanged(isCompleted: boolean) {
  return notifySuccess({
    title: isCompleted ? "タスクを完了にしました" : "タスクを未完了に戻しました",
  });
}

export function notifyTaskDeleted() {
  return notifySuccess({ title: "タスクを削除しました" });
}

export function notifySubmissionCreated() {
  return notifySuccess({ title: "提出物を追加しました" });
}

export function notifySubmissionStatusChanged(statusLabel: string) {
  return notifySuccess({ title: `提出物を「${statusLabel}」に更新しました` });
}

export function notifySubmissionDeleted() {
  return notifySuccess({ title: "提出物を削除しました" });
}

export function notifyCalendarEventCreated(type: "work_block" | "manual") {
  return notifySuccess({
    title: type === "work_block" ? "作業ブロックを追加しました" : "イベントを追加しました",
  });
}

export function notifyCalendarEventDeleted() {
  return notifySuccess({ title: "イベントを削除しました" });
}

export function notifyCalendarSynced() {
  return notifySuccess({
    title: "Googleカレンダーに同期しました",
  });
}

export function notifyCalendarSyncFailed() {
  return notifyError({
    title: "Googleカレンダーの同期に失敗しました",
    description: "バックグラウンドで自動的に再試行します。",
  });
}

export function notifyDocumentCreated() {
  return notifySuccess({ title: "ドキュメントを作成しました" });
}

export function notifyDocumentDeleted() {
  return notifySuccess({ title: "ドキュメントを削除しました" });
}

export function notifyDocumentRestored() {
  return notifySuccess({ title: "ドキュメントを復元しました" });
}

export function notifyDocumentPermanentlyDeleted() {
  return notifySuccess({ title: "ドキュメントを完全削除しました" });
}

export function notifyDocumentStatusChanged(isPublished: boolean) {
  return notifySuccess({
    title: isPublished ? "ドキュメントを公開しました" : "ドキュメントを下書きに戻しました",
  });
}
