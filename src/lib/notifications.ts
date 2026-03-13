"use client";

import { toast } from "sonner";

type NotificationArgs = {
  title: string;
  description?: string;
  duration?: number;
};

const DEFAULT_DURATION = 3600;

export function notifySuccess({ title, description, duration = DEFAULT_DURATION }: NotificationArgs) {
  return toast.success(title, {
    description,
    duration,
  });
}

export function notifyError({ title, description, duration = DEFAULT_DURATION }: NotificationArgs) {
  return toast.error(title, {
    description,
    duration,
  });
}

export function notifyInfo({ title, description, duration = DEFAULT_DURATION }: NotificationArgs) {
  return toast(title, {
    description,
    duration,
  });
}

export function notifyReviewComplete(hasCompanyContext: boolean) {
  return notifySuccess({
    title: "添削が完了しました",
    description: hasCompanyContext
      ? "企業情報を踏まえた改善案、改善ポイント、出典リンクを表示しました"
      : "改善案、改善ポイント、出典リンクを表示しました",
    duration: 4200,
  });
}

export function notifyRateLimit(seconds: number) {
  return notifyError({
    title: "利用回数の上限に達しました",
    description: `${seconds}秒後に再試行できます`,
    duration: Math.min(seconds * 1000, 10000),
  });
}
