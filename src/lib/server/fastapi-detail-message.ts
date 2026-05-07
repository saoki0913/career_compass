/**
 * FastAPI の HTTPException detail（文字列 / オブジェクト / 配列）からユーザー向け短文を取り出す。
 */
type FastApiDetailObject = {
  error?: unknown;
  msg?: unknown;
  message?: unknown;
  error_type?: unknown;
  code?: unknown;
};

export type FastApiErrorResponseOptions = {
  status: number;
  code: string;
  userMessage: string;
  action?: string;
  retryable?: boolean;
  llmErrorType?: string;
  developerMessage?: string;
  details?: string;
  extra?: Record<string, unknown>;
};

const CONFIG_ERROR_TYPES = new Set([
  "tenant_key_not_configured",
  "career_principal_not_configured",
]);

const CONFIG_ERROR_ACTION =
  "管理側で AI 認証設定を確認してから、もう一度お試しください。";

function detailObject(detail: unknown): FastApiDetailObject | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  return detail as FastApiDetailObject;
}

export function messageFromFastApiDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && !Array.isArray(detail)) {
    const o = detailObject(detail);
    if (!o) return undefined;
    if (typeof o.error === "string") return o.error;
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
  }
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const msg = (item as { msg?: unknown }).msg;
        if (typeof msg === "string") return msg;
      }
    }
  }
  return undefined;
}

export function errorTypeFromFastApiDetail(detail: unknown): string | undefined {
  if (typeof detail === "string") {
    if (detail === "tenant key is not configured") return "tenant_key_not_configured";
    if (detail === "career principal is not configured") return "career_principal_not_configured";
    if (detail === "career principal company_id mismatch") return "career_principal_company_mismatch";
    return undefined;
  }

  const o = detailObject(detail);
  if (!o) return undefined;
  if (typeof o.error_type === "string") return o.error_type;
  if (typeof o.code === "string") return o.code;
  return undefined;
}

function detailFromPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const o = payload as { detail?: unknown; error?: unknown };
  return o.detail ?? o.error;
}

function safeDetails(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function normalizeUpstreamStatus(status: number): number {
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }
  return 503;
}

function codeForFastApiError(errorType: string | undefined, status: number, defaultCode: string): string {
  if (errorType === "tenant_key_not_configured") return "FASTAPI_TENANT_KEY_NOT_CONFIGURED";
  if (errorType === "career_principal_not_configured") return "FASTAPI_CAREER_PRINCIPAL_NOT_CONFIGURED";
  if (errorType === "career_principal_company_mismatch") return "FASTAPI_CAREER_PRINCIPAL_MISMATCH";
  if (errorType === "sse_concurrency_exceeded") return "AI_STREAM_CONCURRENCY_EXCEEDED";
  if (errorType === "evaluation_provider_failure") return "MOTIVATION_EVALUATION_PROVIDER_FAILED";
  if (errorType === "question_provider_failure") return "MOTIVATION_QUESTION_PROVIDER_FAILED";
  if (errorType === "question_parse_failure") return "MOTIVATION_QUESTION_PARSE_FAILED";
  if (status === 401) return "FASTAPI_AUTH_REQUIRED";
  if (status === 403) return "FASTAPI_FORBIDDEN";
  if (status === 429) return "FASTAPI_RATE_LIMITED";
  if (status === 504) return "FASTAPI_TIMEOUT";
  return defaultCode;
}

function userMessageForFastApiError(args: {
  status: number;
  errorType?: string;
  upstreamMessage?: string;
  defaultUserMessage: string;
}): string {
  if (args.errorType && CONFIG_ERROR_TYPES.has(args.errorType)) {
    return "AI認証設定が未完了です。管理側で設定確認後に再度お試しください。";
  }
  if (args.errorType === "sse_concurrency_exceeded") {
    return "AI処理が同時に実行されています。完了してからもう一度お試しください。";
  }
  if (args.errorType === "question_parse_failure") {
    return "AIから有効な質問を取得できませんでした。";
  }
  if (args.status === 403) {
    return "この企業の会話を操作できません。";
  }
  if (args.status === 504) {
    return "AIの応答がタイムアウトしました。再度お試しください。";
  }
  if (args.status >= 500) {
    return args.defaultUserMessage;
  }
  return args.upstreamMessage || args.defaultUserMessage;
}

function actionForFastApiError(args: {
  status: number;
  errorType?: string;
  defaultAction?: string;
}): string | undefined {
  if (args.errorType && CONFIG_ERROR_TYPES.has(args.errorType)) {
    return CONFIG_ERROR_ACTION;
  }
  if (args.errorType === "sse_concurrency_exceeded") {
    return "進行中の AI 処理が終わってから、もう一度お試しください。";
  }
  if (args.status === 403) {
    return "画面を再読み込みして、対象企業を確認してください。";
  }
  if (args.status === 504 || args.status >= 500) {
    return args.defaultAction || "時間をおいて、もう一度お試しください。";
  }
  return args.defaultAction;
}

export function buildFastApiErrorResponseOptions(args: {
  status: number;
  payload: unknown;
  defaultCode: string;
  defaultUserMessage: string;
  defaultAction?: string;
  retryable?: boolean;
}): FastApiErrorResponseOptions {
  const status = normalizeUpstreamStatus(args.status);
  const detail = detailFromPayload(args.payload);
  const upstreamMessage = messageFromFastApiDetail(detail);
  const errorType = errorTypeFromFastApiDetail(detail);
  const retryable =
    args.retryable ??
    (status === 408 ||
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504);

  return {
    status,
    code: codeForFastApiError(errorType, status, args.defaultCode),
    userMessage: userMessageForFastApiError({
      status,
      errorType,
      upstreamMessage,
      defaultUserMessage: args.defaultUserMessage,
    }),
    action: actionForFastApiError({
      status,
      errorType,
      defaultAction: args.defaultAction,
    }),
    retryable,
    ...(errorType ? { llmErrorType: errorType } : {}),
    developerMessage: upstreamMessage,
    details: safeDetails(detail),
    extra: {
      upstreamStatus: status,
      ...(errorType ? { upstreamErrorType: errorType } : {}),
    },
  };
}
