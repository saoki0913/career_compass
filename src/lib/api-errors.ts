"use client";

import { logError } from "@/lib/logger";

const DEFAULT_AUTH_REQUIRED_USER_MESSAGE = "ログインが必要です。";
const DEFAULT_AUTH_REQUIRED_ACTION = "ログインしてから、もう一度お試しください。";

/** クライアント側の通信失敗（fetch 未到達など）時に UI で共通表示する次の行動 */
export const CLIENT_NETWORK_DEFAULT_ACTION =
  "インターネット接続を確認して、もう一度お試しください。";

export interface AppUiErrorOptions {
  code: string;
  requestId?: string;
  action?: string;
  retryable?: boolean;
  status?: number;
  developerMessage?: string;
  details?: string;
  /** fetch が応答に至らなかった等のブラウザ側ネットワーク失敗 */
  clientNetworkFailure?: boolean;
}

export class AppUiError extends Error {
  code: string;
  requestId?: string;
  action?: string;
  retryable: boolean;
  status?: number;
  developerMessage?: string;
  details?: string;
  clientNetworkFailure: boolean;

  constructor(message: string, options: AppUiErrorOptions) {
    super(message);
    this.name = "AppUiError";
    this.code = options.code;
    this.requestId = options.requestId;
    this.action = options.action;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.developerMessage = options.developerMessage;
    this.details = options.details;
    this.clientNetworkFailure = options.clientNetworkFailure ?? false;
  }
}

type StructuredApiErrorPayload = {
  error?: {
    code?: string;
    userMessage?: string;
    action?: string;
    retryable?: boolean;
    llmErrorType?: string;
  } | string;
  requestId?: string;
  debug?: {
    developerMessage?: string;
    details?: string;
    status?: number;
  };
  code?: string;
};

export interface ApiErrorFallback {
  code: string;
  userMessage: string;
  action?: string;
  retryable?: boolean;
  authMessage?: string;
  forbiddenMessage?: string;
  notFoundMessage?: string;
  validationMessage?: string;
}

function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function isTechnicalMessage(text: string): boolean {
  return (
    /(internal server error|failed to fetch|authentication required|permission denied|api|response|server log|trace|stack|sql|backend|request failed|request id|requestId|debug|developer|migration|schema|table|db\b)/i.test(
      text
    ) ||
    /サーバーログ|API 応答|SQL|バックエンド|内部|開発|デバッグ|マイグレーション|migration|schema|スキーマ|テーブル|DB|requestId|リクエストID/i.test(
      text
    )
  );
}

function isLikelyUserSafeMessage(text: string): boolean {
  return hasJapanese(text) && !isTechnicalMessage(text);
}

/**
 * ブラウザ側のネットワーク失敗（オフライン、接続切断、CORS 未到達など）。
 * 意図的な中断（AbortError）は含めない。
 */
export function isClientNetworkError(error: unknown): boolean {
  if (error instanceof AppUiError) {
    return error.clientNetworkFailure === true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return false;
  }

  const msg = (error.message || "").toLowerCase();

  if (error instanceof TypeError) {
    if (
      msg.includes("failed to fetch") ||
      msg.includes("load failed") ||
      msg.includes("networkerror") ||
      msg.includes("fetch failed") ||
      msg.includes("network request failed")
    ) {
      return true;
    }
  }

  if (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror when attempting to fetch") ||
    msg.includes("network error") ||
    msg.includes("net::err_") ||
    msg.includes("err_connection") ||
    msg.includes("err_internet_disconnected") ||
    msg.includes("err_name_not_resolved")
  ) {
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (error instanceof TypeError || /fetch|network|load failed/i.test(error.message || "")) {
      return true;
    }
  }

  return false;
}

function resolveLegacyMessage(
  rawMessage: string | null,
  status: number,
  fallback: ApiErrorFallback
): { message: string; code: string } {
  if (rawMessage && isLikelyUserSafeMessage(rawMessage)) {
    return {
      message: rawMessage,
      code: fallback.code,
    };
  }

  if (status === 401) {
    return {
      message: DEFAULT_AUTH_REQUIRED_USER_MESSAGE,
      code: "AUTH_REQUIRED",
    };
  }

  if (status === 403) {
    return {
      message: fallback.forbiddenMessage ?? "この操作を実行できませんでした。権限や連携状態を確認してください。",
      code: "FORBIDDEN",
    };
  }

  if (status === 404) {
    return {
      message: fallback.notFoundMessage ?? fallback.userMessage,
      code: "NOT_FOUND",
    };
  }

  if (status >= 400 && status < 500) {
    return {
      message: fallback.validationMessage ?? fallback.userMessage,
      code: fallback.code,
    };
  }

  return {
    message: fallback.userMessage,
    code: fallback.code,
  };
}

function safeJsonParse(text: string): StructuredApiErrorPayload | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as StructuredApiErrorPayload;
  } catch {
    return null;
  }
}

function logDebugInfo(context: string, error: AppUiError, rawMessage: string | null) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // SSE 等で返る「想定内の再試行可能」失敗は console.error にしない（スタック付き JSON がノイズになる）
  if (error.code === "ES_REVIEW_STREAM_FAILED" && error.retryable) {
    const detail = error.developerMessage || rawMessage || error.message;
    console.warn(`[${context}] ${error.code}:`, detail);
    return;
  }

  // 認証前の初期フェッチや E2E の未ログイン導線では 401 が出ることがあり、JSON の console.error がノイズになる
  const code = error.code;
  const isAuthRequiredDevNoise =
    error.status === 401 &&
    typeof code === "string" &&
    (code === "AUTH_REQUIRED" || code.endsWith("_AUTH_REQUIRED"));
  if (isAuthRequiredDevNoise) {
    console.debug(`[${context}] ${code} (401)`);
    return;
  }

  logError(`${context}:api`, new Error(error.developerMessage || rawMessage || error.message), {
    code: error.code,
    requestId: error.requestId,
    status: error.status,
    details: error.details,
  });
}

export async function parseApiErrorResponse(
  response: Response,
  fallback: ApiErrorFallback,
  context: string
): Promise<AppUiError> {
  const bodyText = await response.text();
  const payload = safeJsonParse(bodyText);
  const requestId = payload?.requestId || response.headers.get("X-Request-Id") || undefined;

  if (payload?.error && typeof payload.error === "object") {
    const message =
      response.status === 401
        ? DEFAULT_AUTH_REQUIRED_USER_MESSAGE
        : payload.error.userMessage || fallback.userMessage;
    const action =
      response.status === 401
        ? DEFAULT_AUTH_REQUIRED_ACTION
        : payload.error.action || fallback.action;
    const error = new AppUiError(message, {
      code: payload.error.code || payload.code || fallback.code,
      requestId,
      action,
      retryable: payload.error.retryable ?? fallback.retryable ?? false,
      status: response.status,
      developerMessage: payload.debug?.developerMessage,
      details: payload.debug?.details,
    });
    logDebugInfo(context, error, null);
    return error;
  }

  const rawMessage =
    typeof payload?.error === "string"
      ? payload.error
      : bodyText.trim() || null;
  const legacy = resolveLegacyMessage(rawMessage, response.status, fallback);
  const error = new AppUiError(legacy.message, {
    code: legacy.code,
    requestId,
    action: response.status === 401 ? DEFAULT_AUTH_REQUIRED_ACTION : fallback.action,
    retryable: fallback.retryable ?? false,
    status: response.status,
    developerMessage: rawMessage || undefined,
  });
  logDebugInfo(context, error, rawMessage);
  return error;
}

export function toAppUiError(
  error: unknown,
  fallback: ApiErrorFallback,
  context: string
): AppUiError {
  if (error instanceof AppUiError) {
    return error;
  }

  const network = isClientNetworkError(error);

  const message =
    error instanceof Error && isLikelyUserSafeMessage(error.message)
      ? error.message
      : fallback.userMessage;

  const uiError = new AppUiError(message, {
    code: fallback.code,
    action: network ? CLIENT_NETWORK_DEFAULT_ACTION : fallback.action,
    retryable: network ? true : (fallback.retryable ?? false),
    developerMessage: error instanceof Error ? error.message : String(error),
    clientNetworkFailure: network,
  });
  logDebugInfo(context, uiError, error instanceof Error ? error.message : String(error));
  return uiError;
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: ApiErrorFallback,
  context: string
): string {
  return toAppUiError(error, fallback, context).message;
}
