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
