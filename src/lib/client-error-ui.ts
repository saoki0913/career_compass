"use client";

import { toAppUiError, type ApiErrorFallback, type AppUiError } from "@/lib/api-errors";
import { notifyError } from "@/lib/notifications";

const swrUserFacingNotifyCooldownUntil = new Map<string, number>();
const SWR_USER_FACING_COOLDOWN_MS = 5000;

/** ユーザー向け `AppUiError` を常に赤スナックバーで表示する */
export function notifyUserFacingAppError(ui: AppUiError): void {
  notifyError({ title: ui.message, description: ui.action });
}

/** `toAppUiError` 相当のメッセージを返し、常に赤スナックバーも表示する */
export function reportUserFacingError(
  error: unknown,
  fallback: ApiErrorFallback,
  context: string,
): string {
  const ui = toAppUiError(error, fallback, context);
  notifyUserFacingAppError(ui);
  return ui.message;
}

export function toAppUiErrorWithSnackbar(
  error: unknown,
  fallback: ApiErrorFallback,
  context: string,
): AppUiError {
  const ui = toAppUiError(error, fallback, context);
  notifyUserFacingAppError(ui);
  return ui;
}

/** SWR 等の同一キー連続失敗でスナックバーが連打されないようクールダウンする */
export function notifySwrUserFacingFailure(ui: AppUiError, cacheKey: string): void {
  const now = Date.now();
  const until = swrUserFacingNotifyCooldownUntil.get(cacheKey) ?? 0;
  if (now < until) {
    return;
  }
  swrUserFacingNotifyCooldownUntil.set(cacheKey, now + SWR_USER_FACING_COOLDOWN_MS);
  notifyUserFacingAppError(ui);
}
